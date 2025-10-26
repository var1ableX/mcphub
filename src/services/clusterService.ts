import { Request, Response } from 'express';
import { URL } from 'url';
import config, { loadSettings } from '../config/index.js';
import { ClusterConfig, ClusterNodeConfig } from '../types/index.js';

interface ProxyContext {
  node: ClusterNodeConfig;
  targetUrl: URL;
}

const sessionBindings = new Map<string, string>();
const groupCounters = new Map<string, number>();

const DEFAULT_GROUP_KEY = '__default__';

const isIterableHeaderValue = (value: string | string[] | undefined): value is string[] => {
  return Array.isArray(value);
};

const createHeadersFromRequest = (req: Request, node: ClusterNodeConfig): Headers => {
  const headers = new Headers();
  for (const [key, rawValue] of Object.entries(req.headers)) {
    if (rawValue === undefined) {
      continue;
    }
    if (key.toLowerCase() === 'host') {
      continue;
    }
    if (isIterableHeaderValue(rawValue)) {
      for (const value of rawValue) {
        headers.append(key, value);
      }
    } else {
      headers.set(key, String(rawValue));
    }
  }

  if (node.forwardHeaders) {
    for (const [key, value] of Object.entries(node.forwardHeaders)) {
      if (value !== undefined) {
        headers.set(key, value);
      }
    }
  }

  return headers;
};

const getClusterConfig = (): ClusterConfig | undefined => {
  const settings = loadSettings();
  return settings.systemConfig?.cluster;
};

const getClusterNodes = (): ClusterNodeConfig[] => {
  const config = getClusterConfig();
  if (!config?.enabled) {
    return [];
  }
  return config.nodes ?? [];
};

const isClusterEnabled = (): boolean => {
  return getClusterNodes().length > 0;
};

const sanitizePathSegment = (segment: string): string => {
  return segment.replace(/^\/+/, '').replace(/\/+$/, '');
};

const joinUrlPaths = (...segments: (string | undefined)[]): string => {
  const sanitizedSegments = segments
    .filter((segment): segment is string => segment !== undefined && segment !== null && segment !== '')
    .map((segment) => sanitizePathSegment(segment));

  if (!sanitizedSegments.length) {
    return '/';
  }

  const joined = sanitizedSegments.filter((segment) => segment.length > 0).join('/');
  return joined ? `/${joined}` : '/';
};

const normalizeBasePath = (path?: string): string => {
  if (!path) {
    return '';
  }
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (normalized === '/') {
    return '';
  }
  if (normalized !== '/' && normalized.endsWith('/')) {
    return normalized.slice(0, -1);
  }
  return normalized;
};

const buildTargetUrl = (node: ClusterNodeConfig, originalUrl: string): URL => {
  const placeholderBase = 'http://cluster.local';
  const requestUrl = new URL(originalUrl, placeholderBase);
  const requestPath = requestUrl.pathname;
  const hubBasePath = normalizeBasePath(config.basePath);
  const relativePath = requestPath.startsWith(hubBasePath)
    ? requestPath.slice(hubBasePath.length) || '/'
    : requestPath;

  const nodePrefix = normalizeBasePath(node.pathPrefix ?? hubBasePath);
  const targetUrl = new URL(node.url);
  targetUrl.pathname = joinUrlPaths(targetUrl.pathname, nodePrefix, relativePath);
  targetUrl.search = requestUrl.search;
  targetUrl.hash = requestUrl.hash;
  return targetUrl;
};

const matchesNodeGroup = (nodeGroup: string, targetGroup: string): boolean => {
  if (!targetGroup) {
    return nodeGroup === '' || nodeGroup === '*' || nodeGroup === 'global' || nodeGroup === 'default';
  }

  if (nodeGroup === '*') {
    return true;
  }

  return nodeGroup === targetGroup;
};

const selectNodeForGroup = (group?: string): ClusterNodeConfig | undefined => {
  const nodes = getClusterNodes();
  if (!nodes.length) {
    return undefined;
  }

  const key = group ?? DEFAULT_GROUP_KEY;
  const normalizedGroup = group ?? '';
  const candidates = nodes.filter((node) => {
    if (!node.groups || node.groups.length === 0) {
      return true;
    }

    return node.groups.some((nodeGroup) => matchesNodeGroup(nodeGroup, normalizedGroup));
  });

  if (!candidates.length) {
    return undefined;
  }

  const weightedCandidates: ClusterNodeConfig[] = [];
  for (const candidate of candidates) {
    const weight = Math.max(1, candidate.weight ?? 1);
    for (let i = 0; i < weight; i += 1) {
      weightedCandidates.push(candidate);
    }
  }

  const index = groupCounters.get(key) ?? 0;
  const selected = weightedCandidates[index % weightedCandidates.length];
  groupCounters.set(key, index + 1);
  return selected;
};

const bindSessionToNode = (sessionId: string, nodeId: string): void => {
  sessionBindings.set(sessionId, nodeId);
};

const releaseSession = (sessionId: string): void => {
  sessionBindings.delete(sessionId);
};

const getNodeForSession = (sessionId: string): ClusterNodeConfig | undefined => {
  const nodeId = sessionBindings.get(sessionId);
  if (!nodeId) {
    return undefined;
  }
  return getClusterNodes().find((node) => node.id === nodeId);
};

const resolveProxyContext = (req: Request, group?: string, sessionId?: string): ProxyContext | undefined => {
  if (!isClusterEnabled()) {
    return undefined;
  }

  if (sessionId) {
    const node = getNodeForSession(sessionId);
    if (node) {
      return { node, targetUrl: buildTargetUrl(node, req.originalUrl) };
    }
  }

  const node = selectNodeForGroup(group);
  if (!node) {
    return undefined;
  }

  return {
    node,
    targetUrl: buildTargetUrl(node, req.originalUrl),
  };
};

const pipeReadableStreamToResponse = async (
  response: globalThis.Response,
  res: Response,
  onData?: (chunk: string) => void,
): Promise<void> => {
  if (!response.body) {
    const text = await response.text();
    res.send(text);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    let finished = false;
    while (!finished) {
      const { value, done } = await reader.read();
      finished = Boolean(done);
      if (value) {
        const chunkString = decoder.decode(value, { stream: true });
        if (onData) {
          onData(chunkString);
        }
        res.write(Buffer.from(value));
      }
    }
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      console.error('Cluster proxy stream error:', error);
    }
  } finally {
    const finalChunk = decoder.decode();
    if (finalChunk && onData) {
      onData(finalChunk);
    }
    res.end();
  }
};

const handleSseStream = async (
  node: ClusterNodeConfig,
  req: Request,
  res: Response,
  context: ProxyContext,
): Promise<void> => {
  const controller = new AbortController();
  const sessionIds = new Set<string>();
  req.on('close', () => {
    controller.abort();
    for (const sessionId of sessionIds) {
      releaseSession(sessionId);
    }
  });

  let response: globalThis.Response;
  try {
    response = await fetch(context.targetUrl, {
      method: 'GET',
      headers: createHeadersFromRequest(req, node),
      signal: controller.signal,
    });
  } catch (error) {
    console.error('Failed to proxy SSE request to cluster node:', error);
    if (!res.headersSent) {
      res.status(502).send('Failed to reach cluster node');
    }
    for (const sessionId of sessionIds) {
      releaseSession(sessionId);
    }
    return;
  }

  res.status(response.status);
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'content-length') {
      return;
    }
    res.setHeader(key, value);
  });

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const isSse = response.headers.get('content-type')?.includes('text/event-stream');
  let buffer = '';
  await pipeReadableStreamToResponse(
    response,
    res,
    isSse
      ? (chunk) => {
          buffer += chunk;
          let boundaryIndex = buffer.indexOf('\n\n');
          while (boundaryIndex !== -1) {
            const rawEvent = buffer.slice(0, boundaryIndex);
            buffer = buffer.slice(boundaryIndex + 2);
            const normalizedEvent = rawEvent.replace(/\r\n/g, '\n');
            const lines = normalizedEvent.split('\n');
            let eventName = '';
            let data = '';
            for (const line of lines) {
              if (line.startsWith('event:')) {
                eventName = line.slice(6).trim();
              }
              if (line.startsWith('data:')) {
                data += `${line.slice(5).trim()}`;
              }
            }
            if (eventName === 'endpoint' && data) {
              try {
                const sessionUrl = new URL(data, 'http://localhost');
                const sessionId = sessionUrl.searchParams.get('sessionId');
                if (sessionId) {
                  bindSessionToNode(sessionId, node.id);
                  sessionIds.add(sessionId);
                }
              } catch (error) {
                console.warn('Failed to parse session endpoint from cluster response:', error);
              }
            }
            boundaryIndex = buffer.indexOf('\n\n');
          }
        }
      : undefined,
  );

  for (const sessionId of sessionIds) {
    releaseSession(sessionId);
  }
};

const forwardRequest = async (
  req: Request,
  res: Response,
  context: ProxyContext,
  options?: { releaseSession?: string },
): Promise<void> => {
  const { node, targetUrl } = context;
  const method = req.method.toUpperCase();
  const init: RequestInit = {
    method,
    headers: createHeadersFromRequest(req, node),
  };

  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    if (req.body !== undefined) {
      init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }
  }

  const controller = new AbortController();
  init.signal = controller.signal;
  req.on('close', () => {
    controller.abort();
  });

  let response: globalThis.Response;
  try {
    response = await fetch(targetUrl, init);
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      console.error('Failed to proxy request to cluster node:', error);
    }
    if (!res.headersSent) {
      res.status(502).send('Failed to reach cluster node');
    }
    if (options?.releaseSession) {
      releaseSession(options.releaseSession);
    }
    return;
  }

  const newSessionId = response.headers.get('mcp-session-id');
  if (newSessionId) {
    bindSessionToNode(newSessionId, node.id);
  }

  res.status(response.status);
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'content-length') {
      return;
    }
    res.setHeader(key, value);
  });

  if (response.headers.get('content-type')?.includes('text/event-stream')) {
    await pipeReadableStreamToResponse(response, res);
  } else {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0) {
      res.end();
    } else {
      res.send(Buffer.from(buffer));
    }
  }

  if (options?.releaseSession) {
    releaseSession(options.releaseSession);
  }
};

export const tryProxySseConnection = async (
  req: Request,
  res: Response,
  group?: string,
): Promise<boolean> => {
  const context = resolveProxyContext(req, group);
  if (!context) {
    return false;
  }

  await handleSseStream(context.node, req, res, context);
  return true;
};

export const tryProxySseMessage = async (req: Request, res: Response): Promise<boolean> => {
  const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;
  if (!sessionId) {
    return false;
  }

  const context = resolveProxyContext(req, undefined, sessionId);
  if (!context) {
    return false;
  }

  await forwardRequest(req, res, context);
  return true;
};

export const tryProxyMcpRequest = async (
  req: Request,
  res: Response,
  group?: string,
): Promise<boolean> => {
  const sessionIdHeader = req.headers['mcp-session-id'];
  const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;
  const context = resolveProxyContext(req, group, sessionId);
  if (!context) {
    return false;
  }

  const releaseTarget = req.method.toUpperCase() === 'DELETE' ? sessionId : undefined;
  await forwardRequest(req, res, context, { releaseSession: releaseTarget });
  return true;
};

export const clearClusterSessionBindings = (): void => {
  sessionBindings.clear();
  groupCounters.clear();
};

export const __clusterInternals = {
  joinUrlPaths,
  normalizeBasePath,
  matchesNodeGroup,
  buildTargetUrl,
};
