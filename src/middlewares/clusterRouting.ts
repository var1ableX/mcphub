/**
 * Cluster Routing Middleware
 * 
 * Handles routing of MCP requests in cluster mode:
 * - Determines target node based on session affinity
 * - Proxies requests to appropriate nodes
 * - Maintains sticky sessions
 */

import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import {
  isClusterEnabled,
  getClusterMode,
  getNodeForSession,
  getCurrentNodeId,
} from '../services/clusterService.js';

/**
 * Cluster routing middleware for SSE connections
 */
export const clusterSseRouting = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  // If cluster is not enabled or we're in standalone mode, proceed normally
  if (!isClusterEnabled() || getClusterMode() === 'standalone') {
    next();
    return;
  }

  // Coordinator should handle all requests normally
  if (getClusterMode() === 'coordinator') {
    // For coordinator, we need to route to appropriate node
    await routeToNode(req, res, next);
    return;
  }

  // For regular nodes, proceed normally (they handle their own servers)
  next();
};

/**
 * Cluster routing middleware for MCP HTTP requests
 */
export const clusterMcpRouting = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  // If cluster is not enabled or we're in standalone mode, proceed normally
  if (!isClusterEnabled() || getClusterMode() === 'standalone') {
    next();
    return;
  }

  // Coordinator should route requests to appropriate nodes
  if (getClusterMode() === 'coordinator') {
    await routeToNode(req, res, next);
    return;
  }

  // For regular nodes, proceed normally
  next();
};

/**
 * Route request to appropriate node based on session affinity
 */
const routeToNode = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // Extract session ID from headers or generate new one
    const sessionId = 
      (req.headers['mcp-session-id'] as string) ||
      (req.query.sessionId as string) ||
      generateSessionId(req);

    // Determine target node
    const group = req.params.group;
    const targetNode = getNodeForSession(sessionId, group, req.headers);

    if (!targetNode) {
      // No available nodes, return error
      res.status(503).json({
        success: false,
        message: 'No available nodes to handle request',
      });
      return;
    }

    // Check if this is the current node
    const currentNodeId = getCurrentNodeId();
    if (currentNodeId && targetNode.id === currentNodeId) {
      // Handle locally
      next();
      return;
    }

    // Proxy request to target node
    await proxyRequest(req, res, targetNode.url);
  } catch (error) {
    console.error('Error in cluster routing:', error);
    next(error);
  }
};

/**
 * Generate session ID from request
 */
const generateSessionId = (req: Request): string => {
  // Use IP address and user agent as seed for consistent hashing
  const seed = `${req.ip}-${req.get('user-agent') || 'unknown'}`;
  return Buffer.from(seed).toString('base64');
};

/**
 * Proxy request to another node
 */
const proxyRequest = async (
  req: Request,
  res: Response,
  targetUrl: string,
): Promise<void> => {
  try {
    // Build target URL
    const url = new URL(req.originalUrl || req.url, targetUrl);
    
    // Prepare headers (excluding host and connection headers)
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (
        key.toLowerCase() !== 'host' &&
        key.toLowerCase() !== 'connection' &&
        value
      ) {
        headers[key] = Array.isArray(value) ? value[0] : value;
      }
    }

    // Forward request to target node
    const response = await axios({
      method: req.method,
      url: url.toString(),
      headers,
      data: req.body,
      responseType: 'stream',
      timeout: 30000,
      validateStatus: () => true, // Don't throw on any status
    });

    // Forward response headers
    for (const [key, value] of Object.entries(response.headers)) {
      if (
        key.toLowerCase() !== 'connection' &&
        key.toLowerCase() !== 'transfer-encoding'
      ) {
        res.setHeader(key, value as string);
      }
    }

    // Forward status code and stream response
    res.status(response.status);
    response.data.pipe(res);
  } catch (error) {
    console.error('Error proxying request:', error);
    res.status(502).json({
      success: false,
      message: 'Failed to proxy request to target node',
    });
  }
};
