/**
 * Cluster Service
 * 
 * Manages cluster functionality including:
 * - Node registration and discovery
 * - Health checking and heartbeats
 * - Session affinity (sticky sessions)
 * - Load balancing across replicas
 */

import { randomUUID } from 'crypto';
import os from 'os';
import crypto from 'crypto';
import axios from 'axios';
import {
  ClusterNode,
  ClusterConfig,
  ServerReplica,
  SessionAffinity,
} from '../types/index.js';
import { loadSettings } from '../config/index.js';

// In-memory storage for cluster state
const nodes: Map<string, ClusterNode> = new Map();
const sessionAffinities: Map<string, SessionAffinity> = new Map();
const serverReplicas: Map<string, ServerReplica[]> = new Map();
let currentNodeId: string | null = null;
let heartbeatIntervalId: NodeJS.Timeout | null = null;
let cleanupIntervalId: NodeJS.Timeout | null = null;

/**
 * Get cluster configuration from settings
 */
export const getClusterConfig = (): ClusterConfig | null => {
  const settings = loadSettings();
  return settings.systemConfig?.cluster || null;
};

/**
 * Check if cluster mode is enabled
 */
export const isClusterEnabled = (): boolean => {
  const config = getClusterConfig();
  return config?.enabled === true;
};

/**
 * Get the current node's operating mode
 */
export const getClusterMode = (): 'standalone' | 'node' | 'coordinator' => {
  const config = getClusterConfig();
  if (!config?.enabled) {
    return 'standalone';
  }
  return config.mode || 'standalone';
};

/**
 * Get the current node ID
 */
export const getCurrentNodeId = (): string | null => {
  return currentNodeId;
};

/**
 * Initialize cluster service based on configuration
 */
export const initClusterService = async (): Promise<void> => {
  const config = getClusterConfig();
  
  if (!config?.enabled) {
    console.log('Cluster mode is disabled');
    return;
  }

  console.log(`Initializing cluster service in ${config.mode} mode`);

  switch (config.mode) {
    case 'node':
      await initAsNode(config);
      break;
    case 'coordinator':
      await initAsCoordinator(config);
      break;
    case 'standalone':
    default:
      console.log('Running in standalone mode');
      break;
  }
};

/**
 * Initialize this instance as a cluster node
 */
const initAsNode = async (config: ClusterConfig): Promise<void> => {
  if (!config.node) {
    throw new Error('Node configuration is required for cluster node mode');
  }

  // Generate or use provided node ID
  currentNodeId = config.node.id || randomUUID();
  
  const nodeName = config.node.name || os.hostname();
  const port = process.env.PORT || 3000;
  
  console.log(`Initializing as cluster node: ${nodeName} (${currentNodeId})`);

  // Register with coordinator if enabled
  if (config.node.registerOnStartup !== false) {
    await registerWithCoordinator(config, nodeName, Number(port));
  }

  // Start heartbeat to coordinator
  const heartbeatInterval = config.node.heartbeatInterval || 5000;
  heartbeatIntervalId = setInterval(async () => {
    await sendHeartbeat(config, nodeName, Number(port));
  }, heartbeatInterval);

  console.log(`Node registered with coordinator at ${config.node.coordinatorUrl}`);
};

/**
 * Initialize this instance as the coordinator
 */
const initAsCoordinator = async (config: ClusterConfig): Promise<void> => {
  currentNodeId = 'coordinator';
  
  console.log('Initializing as cluster coordinator');

  // Start cleanup interval for inactive nodes
  const cleanupInterval = config.coordinator?.cleanupInterval || 30000;
  cleanupIntervalId = setInterval(() => {
    cleanupInactiveNodes(config);
  }, cleanupInterval);

  console.log('Cluster coordinator initialized');
};

/**
 * Register this node with the coordinator
 */
const registerWithCoordinator = async (
  config: ClusterConfig,
  nodeName: string,
  port: number,
): Promise<void> => {
  if (!config.node?.coordinatorUrl) {
    return;
  }

  const hostname = os.hostname();
  const nodeUrl = `http://${hostname}:${port}`;
  
  // Get list of local MCP servers
  const settings = loadSettings();
  const servers = Object.keys(settings.mcpServers || {});

  const nodeInfo: ClusterNode = {
    id: currentNodeId!,
    name: nodeName,
    host: hostname,
    port,
    url: nodeUrl,
    status: 'active',
    lastHeartbeat: Date.now(),
    servers,
  };

  try {
    await axios.post(
      `${config.node.coordinatorUrl}/api/cluster/register`,
      nodeInfo,
      { timeout: 5000 }
    );
    console.log('Successfully registered with coordinator');
  } catch (error) {
    console.error('Failed to register with coordinator:', error);
  }
};

/**
 * Send heartbeat to coordinator
 */
const sendHeartbeat = async (
  config: ClusterConfig,
  nodeName: string,
  port: number,
): Promise<void> => {
  if (!config.node?.coordinatorUrl || !currentNodeId) {
    return;
  }

  const hostname = os.hostname();
  const settings = loadSettings();
  const servers = Object.keys(settings.mcpServers || {});

  try {
    await axios.post(
      `${config.node.coordinatorUrl}/api/cluster/heartbeat`,
      {
        id: currentNodeId,
        name: nodeName,
        host: hostname,
        port,
        servers,
        timestamp: Date.now(),
      },
      { timeout: 5000 }
    );
  } catch (error) {
    console.warn('Failed to send heartbeat to coordinator:', error);
  }
};

/**
 * Cleanup inactive nodes (coordinator only)
 */
const cleanupInactiveNodes = (config: ClusterConfig): void => {
  const timeout = config.coordinator?.nodeTimeout || 15000;
  const now = Date.now();

  for (const [nodeId, node] of nodes.entries()) {
    if (now - node.lastHeartbeat > timeout) {
      console.log(`Marking node ${nodeId} as unhealthy (last heartbeat: ${new Date(node.lastHeartbeat).toISOString()})`);
      node.status = 'unhealthy';
      
      // Remove server replicas for this node
      for (const [serverId, replicas] of serverReplicas.entries()) {
        const updatedReplicas = replicas.filter(r => r.nodeId !== nodeId);
        if (updatedReplicas.length === 0) {
          serverReplicas.delete(serverId);
        } else {
          serverReplicas.set(serverId, updatedReplicas);
        }
      }
    }
  }

  // Clean up expired session affinities
  const _sessionTimeout = config.coordinator?.stickySessionTimeout || 3600000; // 1 hour
  for (const [sessionId, affinity] of sessionAffinities.entries()) {
    if (now > affinity.expiresAt) {
      sessionAffinities.delete(sessionId);
      console.log(`Removed expired session affinity: ${sessionId}`);
    }
  }
};

/**
 * Register a node (coordinator endpoint)
 */
export const registerNode = (nodeInfo: ClusterNode): void => {
  nodes.set(nodeInfo.id, {
    ...nodeInfo,
    status: 'active',
    lastHeartbeat: Date.now(),
  });

  // Update server replicas
  for (const serverId of nodeInfo.servers) {
    const replicas = serverReplicas.get(serverId) || [];
    
    // Check if replica already exists
    const existingIndex = replicas.findIndex(r => r.nodeId === nodeInfo.id);
    const replica: ServerReplica = {
      serverId,
      nodeId: nodeInfo.id,
      nodeUrl: nodeInfo.url,
      status: 'active',
      weight: 1,
    };

    if (existingIndex >= 0) {
      replicas[existingIndex] = replica;
    } else {
      replicas.push(replica);
    }

    serverReplicas.set(serverId, replicas);
  }

  console.log(`Node registered: ${nodeInfo.name} (${nodeInfo.id}) with ${nodeInfo.servers.length} servers`);
};

/**
 * Update node heartbeat (coordinator endpoint)
 */
export const updateNodeHeartbeat = (nodeId: string, servers: string[]): void => {
  const node = nodes.get(nodeId);
  if (!node) {
    console.warn(`Received heartbeat from unknown node: ${nodeId}`);
    return;
  }

  node.lastHeartbeat = Date.now();
  node.status = 'active';
  node.servers = servers;

  // Update server replicas
  const currentReplicas = new Set<string>();
  for (const [serverId, replicas] of serverReplicas.entries()) {
    for (const replica of replicas) {
      if (replica.nodeId === nodeId) {
        currentReplicas.add(serverId);
      }
    }
  }

  // Add new servers
  for (const serverId of servers) {
    if (!currentReplicas.has(serverId)) {
      const replicas = serverReplicas.get(serverId) || [];
      replicas.push({
        serverId,
        nodeId,
        nodeUrl: node.url,
        status: 'active',
        weight: 1,
      });
      serverReplicas.set(serverId, replicas);
    }
  }

  // Remove servers that are no longer on this node
  for (const serverId of currentReplicas) {
    if (!servers.includes(serverId)) {
      const replicas = serverReplicas.get(serverId) || [];
      const updatedReplicas = replicas.filter(r => r.nodeId !== nodeId);
      if (updatedReplicas.length === 0) {
        serverReplicas.delete(serverId);
      } else {
        serverReplicas.set(serverId, updatedReplicas);
      }
    }
  }
};

/**
 * Get all active nodes (coordinator)
 */
export const getActiveNodes = (): ClusterNode[] => {
  return Array.from(nodes.values()).filter(n => n.status === 'active');
};

/**
 * Get all nodes including unhealthy ones (coordinator)
 */
export const getAllNodes = (): ClusterNode[] => {
  return Array.from(nodes.values());
};

/**
 * Get replicas for a specific server
 */
export const getServerReplicas = (serverId: string): ServerReplica[] => {
  return serverReplicas.get(serverId) || [];
};

/**
 * Get node for a session using sticky session strategy
 */
export const getNodeForSession = (
  sessionId: string,
  serverId?: string,
  headers?: Record<string, string | string[] | undefined>
): ClusterNode | null => {
  const config = getClusterConfig();
  
  if (!config?.enabled || !config.stickySession?.enabled) {
    return null;
  }

  // Check if session already has affinity
  const existingAffinity = sessionAffinities.get(sessionId);
  if (existingAffinity) {
    const node = nodes.get(existingAffinity.nodeId);
    if (node && node.status === 'active') {
      // Update last accessed time
      existingAffinity.lastAccessed = Date.now();
      return node;
    } else {
      // Node is no longer active, remove affinity
      sessionAffinities.delete(sessionId);
    }
  }

  // Determine which node to use based on strategy
  const strategy = config.stickySession.strategy || 'consistent-hash';
  let targetNode: ClusterNode | null = null;

  switch (strategy) {
    case 'consistent-hash':
      targetNode = getNodeByConsistentHash(sessionId, serverId);
      break;
    case 'cookie':
      targetNode = getNodeByCookie(headers, serverId);
      break;
    case 'header':
      targetNode = getNodeByHeader(headers, serverId);
      break;
  }

  if (targetNode) {
    // Create session affinity
    const timeout = config.coordinator?.stickySessionTimeout || 3600000;
    const affinity: SessionAffinity = {
      sessionId,
      nodeId: targetNode.id,
      serverId,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      expiresAt: Date.now() + timeout,
    };
    sessionAffinities.set(sessionId, affinity);
  }

  return targetNode;
};

/**
 * Get node using consistent hashing
 */
const getNodeByConsistentHash = (sessionId: string, serverId?: string): ClusterNode | null => {
  let availableNodes = getActiveNodes();

  // Filter nodes that have the server if serverId is specified
  if (serverId) {
    const replicas = getServerReplicas(serverId);
    const nodeIds = new Set(replicas.filter(r => r.status === 'active').map(r => r.nodeId));
    availableNodes = availableNodes.filter(n => nodeIds.has(n.id));
  }

  if (availableNodes.length === 0) {
    return null;
  }

  // Simple consistent hash: hash session ID and mod by node count
  const hash = crypto.createHash('md5').update(sessionId).digest('hex');
  const hashNum = parseInt(hash.substring(0, 8), 16);
  const index = hashNum % availableNodes.length;

  return availableNodes[index];
};

/**
 * Get node from cookie
 */
const getNodeByCookie = (
  headers?: Record<string, string | string[] | undefined>,
  serverId?: string
): ClusterNode | null => {
  if (!headers?.cookie) {
    return getNodeByConsistentHash(randomUUID(), serverId);
  }

  const config = getClusterConfig();
  const cookieName = config?.stickySession?.cookieName || 'MCPHUB_NODE';
  
  const cookies = (Array.isArray(headers.cookie) ? headers.cookie[0] : headers.cookie) || '';
  const cookieMatch = cookies.match(new RegExp(`${cookieName}=([^;]+)`));
  
  if (cookieMatch) {
    const nodeId = cookieMatch[1];
    const node = nodes.get(nodeId);
    if (node && node.status === 'active') {
      return node;
    }
  }

  return getNodeByConsistentHash(randomUUID(), serverId);
};

/**
 * Get node from header
 */
const getNodeByHeader = (
  headers?: Record<string, string | string[] | undefined>,
  serverId?: string
): ClusterNode | null => {
  const config = getClusterConfig();
  const headerName = (config?.stickySession?.headerName || 'X-MCPHub-Node').toLowerCase();
  
  if (headers) {
    const nodeId = headers[headerName];
    if (nodeId) {
      const nodeIdStr = Array.isArray(nodeId) ? nodeId[0] : nodeId;
      const node = nodes.get(nodeIdStr);
      if (node && node.status === 'active') {
        return node;
      }
    }
  }

  return getNodeByConsistentHash(randomUUID(), serverId);
};

/**
 * Get session affinity info for a session
 */
export const getSessionAffinity = (sessionId: string): SessionAffinity | null => {
  return sessionAffinities.get(sessionId) || null;
};

/**
 * Remove session affinity
 */
export const removeSessionAffinity = (sessionId: string): void => {
  sessionAffinities.delete(sessionId);
};

/**
 * Shutdown cluster service
 */
export const shutdownClusterService = (): void => {
  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }

  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }

  console.log('Cluster service shut down');
};

/**
 * Get cluster statistics
 */
export const getClusterStats = () => {
  return {
    nodes: nodes.size,
    activeNodes: getActiveNodes().length,
    servers: serverReplicas.size,
    sessions: sessionAffinities.size,
  };
};
