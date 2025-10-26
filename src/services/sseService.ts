import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { request as undiciRequest } from 'undici';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { deleteMcpServer, getMcpServer } from './mcpService.js';
import { loadSettings } from '../config/index.js';
import config from '../config/index.js';
import { UserContextService } from './userContextService.js';
import { RequestContextService } from './requestContextService.js';
import { clusterService } from './clusterService.js';

const transports: { [sessionId: string]: { transport: Transport; group: string } } = {};

const hopByHopHeaders = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

const buildProxyHeaders = (req: Request): Record<string, string> => {
  const headers: Record<string, string> = {};

  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) {
      continue;
    }
    const lower = key.toLowerCase();
    if (hopByHopHeaders.has(lower)) {
      continue;
    }
    headers[lower] = Array.isArray(value) ? value.join(', ') : value;
  }

  const ip = req.ip || req.socket.remoteAddress;
  if (ip) {
    headers['x-forwarded-for'] = headers['x-forwarded-for']
      ? `${headers['x-forwarded-for']}, ${ip}`
      : ip;
  }
  headers['x-forwarded-host'] = req.headers['host'] ? String(req.headers['host']) : req.hostname;
  headers['x-forwarded-proto'] = req.protocol;

  return headers;
};

const proxyToClusterNode = async (req: Request, res: Response, nodeId: string): Promise<boolean> => {
  const baseUrl = await clusterService.getNodeBaseUrl(nodeId);
  if (!baseUrl) {
    res.status(503).send('Cluster node unavailable');
    return true;
  }

  const targetUrl = new URL(req.originalUrl || req.url, baseUrl);
  const headers = buildProxyHeaders(req);
  const method = (req.method || 'GET').toUpperCase();

  let body: string | Buffer | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    const reqBody = req.body;
    if (Buffer.isBuffer(reqBody)) {
      body = reqBody;
    } else if (typeof reqBody === 'string') {
      body = reqBody;
    } else if (reqBody !== undefined) {
      body = JSON.stringify(reqBody);
      if (!headers['content-type']) {
        headers['content-type'] = 'application/json';
      }
    }
  }

  try {
    const response = await undiciRequest(targetUrl, {
      method,
      headers,
      body,
      bodyTimeout: 0,
      headersTimeout: 0,
    });

    res.status(response.statusCode);
    for (const [key, value] of Object.entries(response.headers)) {
      if (value === undefined) {
        continue;
      }
      if (Array.isArray(value)) {
        res.setHeader(key, value);
      } else {
        res.setHeader(key, value);
      }
    }

    if (response.body) {
      response.body.on('error', (error: unknown) => {
        console.error(`Cluster proxy stream error from node ${nodeId}:`, error);
        if (error instanceof Error) {
          res.destroy(error);
        } else {
          res.destroy(new Error('Cluster proxy stream failure'));
        }
      });
      response.body.pipe(res);
    } else {
      res.end();
    }
    return true;
  } catch (error) {
    console.error(`Failed to proxy request to cluster node ${nodeId}:`, error);
    if (!res.headersSent) {
      res.status(502).send('Cluster proxy failure');
    } else {
      res.end();
    }
    return true;
  }
};

const maybeProxyClusterRequest = async (
  req: Request,
  res: Response,
  sessionId?: string,
): Promise<boolean> => {
  if (!sessionId || !clusterService.isEnabled()) {
    return false;
  }

  try {
    const session = await clusterService.getSession(sessionId);
    const localNodeId = clusterService.getLocalNodeId();

    if (session && localNodeId && session.nodeId !== localNodeId) {
      return proxyToClusterNode(req, res, session.nodeId);
    }
  } catch (error) {
    console.error('Cluster session lookup failed:', error);
  }

  return false;
};

export const getGroup = (sessionId: string): string => {
  return transports[sessionId]?.group || '';
};

// Helper function to validate bearer auth
const validateBearerAuth = (req: Request): boolean => {
  const settings = loadSettings();
  const routingConfig = settings.systemConfig?.routing || {
    enableGlobalRoute: true,
    enableGroupNameRoute: true,
    enableBearerAuth: false,
    bearerAuthKey: '',
  };

  if (routingConfig.enableBearerAuth) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return false;
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix
    return token === routingConfig.bearerAuthKey;
  }

  return true;
};

export const handleSseConnection = async (req: Request, res: Response): Promise<void> => {
  await clusterService.initialize();
  // User context is now set by sseUserContextMiddleware
  const userContextService = UserContextService.getInstance();
  const currentUser = userContextService.getCurrentUser();
  const username = currentUser?.username;

  // Check bearer auth using filtered settings
  if (!validateBearerAuth(req)) {
    console.warn('Bearer authentication failed or not provided');
    res.status(401).send('Bearer authentication required or invalid token');
    return;
  }

  const settings = loadSettings();
  const routingConfig = settings.systemConfig?.routing || {
    enableGlobalRoute: true,
    enableGroupNameRoute: true,
    enableBearerAuth: false,
    bearerAuthKey: '',
  };
  const group = req.params.group;

  // Check if this is a global route (no group) and if it's allowed
  if (!group && !routingConfig.enableGlobalRoute) {
    console.warn('Global routes are disabled, group ID is required');
    res.status(403).send('Global routes are disabled. Please specify a group ID.');
    return;
  }

  // For user-scoped routes, validate that the user has access to the requested group
  if (username && group) {
    // Additional validation can be added here to check if user has access to the group
    console.log(`User ${username} accessing group: ${group}`);
  }

  // Construct the appropriate messages path based on user context
  const messagesPath = username
    ? `${config.basePath}/${username}/messages`
    : `${config.basePath}/messages`;

  console.log(`Creating SSE transport with messages path: ${messagesPath}`);

  const transport = new SSEServerTransport(messagesPath, res);
  transports[transport.sessionId] = { transport, group: group };

  clusterService
    .recordSession(transport.sessionId, { group, user: username })
    .catch((error) => {
      console.error('Failed to record cluster session:', error);
    });

  res.on('close', () => {
    delete transports[transport.sessionId];
    deleteMcpServer(transport.sessionId);
    console.log(`SSE connection closed: ${transport.sessionId}`);
    clusterService.clearSession(transport.sessionId).catch((error) => {
      console.error('Failed to clear cluster session:', error);
    });
  });

  console.log(
    `New SSE connection established: ${transport.sessionId} with group: ${group || 'global'}${username ? ` for user: ${username}` : ''}`,
  );
  await getMcpServer(transport.sessionId, group).connect(transport);
};

export const handleSseMessage = async (req: Request, res: Response): Promise<void> => {
  await clusterService.initialize();
  // User context is now set by sseUserContextMiddleware
  const userContextService = UserContextService.getInstance();
  const currentUser = userContextService.getCurrentUser();
  const username = currentUser?.username;

  // Check bearer auth using filtered settings
  if (!validateBearerAuth(req)) {
    res.status(401).send('Bearer authentication required or invalid token');
    return;
  }

  const sessionId = req.query.sessionId as string;

  // Validate sessionId
  if (!sessionId) {
    console.error('Missing sessionId in query parameters');
    res.status(400).send('Missing sessionId parameter');
    return;
  }

  if (await maybeProxyClusterRequest(req, res, sessionId)) {
    return;
  }

  // Check if transport exists before destructuring
  const transportData = transports[sessionId];
  if (!transportData) {
    console.warn(`No transport found for sessionId: ${sessionId}`);
    res.status(404).send('No transport found for sessionId');
    return;
  }

  const { transport, group } = transportData;
  req.params.group = group;
  req.query.group = group;
  console.log(
    `Received message for sessionId: ${sessionId} in group: ${group}${username ? ` for user: ${username}` : ''}`,
  );

  // Set request context for MCP handlers to access HTTP headers
  const requestContextService = RequestContextService.getInstance();
  requestContextService.setRequestContext(req);

  try {
    await (transport as SSEServerTransport).handlePostMessage(req, res);
  } finally {
    // Clean up request context after handling
    requestContextService.clearRequestContext();
  }
};

export const handleMcpPostRequest = async (req: Request, res: Response): Promise<void> => {
  await clusterService.initialize();
  // User context is now set by sseUserContextMiddleware
  const userContextService = UserContextService.getInstance();
  const currentUser = userContextService.getCurrentUser();
  const username = currentUser?.username;

  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  const group = req.params.group;
  const body = req.body;

  // Check bearer auth using filtered settings
  if (!validateBearerAuth(req)) {
    res.status(401).send('Bearer authentication required or invalid token');
    return;
  }

  // Get filtered settings based on user context (after setting user context)
  const settings = loadSettings();
  const routingConfig = settings.systemConfig?.routing || {
    enableGlobalRoute: true,
    enableGroupNameRoute: true,
  };
  if (!group && !routingConfig.enableGlobalRoute) {
    res.status(403).send('Global routes are disabled. Please specify a group ID.');
    return;
  }

  if (await maybeProxyClusterRequest(req, res, sessionId)) {
    return;
  }

  console.log(
    `Handling MCP post request for sessionId: ${sessionId} and group: ${group}${username ? ` for user: ${username}` : ''} with body: ${JSON.stringify(body)}`,
  );

  let transport: StreamableHTTPServerTransport;
  if (sessionId && transports[sessionId]) {
    console.log(`Reusing existing transport for sessionId: ${sessionId}`);
    transport = transports[sessionId].transport as StreamableHTTPServerTransport;
  } else if (!sessionId && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        transports[sessionId] = { transport, group };
        clusterService
          .recordSession(sessionId, { group, user: username })
          .catch((error) => console.error('Failed to record cluster session:', error));
      },
    });

    transport.onclose = () => {
      console.log(`Transport closed: ${transport.sessionId}`);
      if (transport.sessionId) {
        delete transports[transport.sessionId];
        deleteMcpServer(transport.sessionId);
        console.log(`MCP connection closed: ${transport.sessionId}`);
        clusterService.clearSession(transport.sessionId).catch((error) => {
          console.error('Failed to clear cluster session:', error);
        });
      }
    };

    console.log(
      `MCP connection established: ${transport.sessionId}${username ? ` for user: ${username}` : ''}`,
    );
    await getMcpServer(transport.sessionId, group).connect(transport);
  } else {
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Bad Request: No valid session ID provided',
      },
      id: null,
    });
    return;
  }

  console.log(`Handling request using transport with type ${transport.constructor.name}`);

  // Set request context for MCP handlers to access HTTP headers
  const requestContextService = RequestContextService.getInstance();
  requestContextService.setRequestContext(req);

  try {
    await transport.handleRequest(req, res, req.body);
  } finally {
    // Clean up request context after handling
    requestContextService.clearRequestContext();
  }
};

export const handleMcpOtherRequest = async (req: Request, res: Response) => {
  await clusterService.initialize();
  // User context is now set by sseUserContextMiddleware
  const userContextService = UserContextService.getInstance();
  const currentUser = userContextService.getCurrentUser();
  const username = currentUser?.username;

  console.log(`Handling MCP other request${username ? ` for user: ${username}` : ''}`);

  // Check bearer auth using filtered settings
  if (!validateBearerAuth(req)) {
    res.status(401).send('Bearer authentication required or invalid token');
    return;
  }

  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }

  if (await maybeProxyClusterRequest(req, res, sessionId)) {
    return;
  }

  if (!transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }

  const { transport } = transports[sessionId];
  await (transport as StreamableHTTPServerTransport).handleRequest(req, res);
};

export const getConnectionCount = (): number => {
  return Object.keys(transports).length;
};
