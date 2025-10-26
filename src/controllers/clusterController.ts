/**
 * Cluster Controller
 * 
 * Handles cluster-related API endpoints:
 * - Node registration
 * - Heartbeat updates
 * - Cluster status queries
 * - Session affinity management
 */

import { Request, Response } from 'express';
import {
  getClusterMode,
  isClusterEnabled,
  getCurrentNodeId,
  registerNode,
  updateNodeHeartbeat,
  getActiveNodes,
  getAllNodes,
  getServerReplicas,
  getSessionAffinity,
  getClusterStats,
} from '../services/clusterService.js';
import { ClusterNode } from '../types/index.js';

/**
 * Get cluster status
 * GET /api/cluster/status
 */
export const getClusterStatus = (_req: Request, res: Response): void => {
  try {
    const enabled = isClusterEnabled();
    const mode = getClusterMode();
    const nodeId = getCurrentNodeId();
    const stats = getClusterStats();

    res.json({
      success: true,
      data: {
        enabled,
        mode,
        nodeId,
        stats,
      },
    });
  } catch (error) {
    console.error('Error getting cluster status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get cluster status',
    });
  }
};

/**
 * Register a node (coordinator only)
 * POST /api/cluster/register
 */
export const registerNodeEndpoint = (req: Request, res: Response): void => {
  try {
    const mode = getClusterMode();
    
    if (mode !== 'coordinator') {
      res.status(403).json({
        success: false,
        message: 'This endpoint is only available on coordinator nodes',
      });
      return;
    }

    const nodeInfo: ClusterNode = req.body;
    
    // Validate required fields
    if (!nodeInfo.id || !nodeInfo.name || !nodeInfo.url) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: id, name, url',
      });
      return;
    }

    registerNode(nodeInfo);

    res.json({
      success: true,
      message: 'Node registered successfully',
    });
  } catch (error) {
    console.error('Error registering node:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register node',
    });
  }
};

/**
 * Update node heartbeat (coordinator only)
 * POST /api/cluster/heartbeat
 */
export const updateHeartbeat = (req: Request, res: Response): void => {
  try {
    const mode = getClusterMode();
    
    if (mode !== 'coordinator') {
      res.status(403).json({
        success: false,
        message: 'This endpoint is only available on coordinator nodes',
      });
      return;
    }

    const { id, servers } = req.body;
    
    if (!id) {
      res.status(400).json({
        success: false,
        message: 'Missing required field: id',
      });
      return;
    }

    updateNodeHeartbeat(id, servers || []);

    res.json({
      success: true,
      message: 'Heartbeat updated successfully',
    });
  } catch (error) {
    console.error('Error updating heartbeat:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update heartbeat',
    });
  }
};

/**
 * Get all nodes (coordinator only)
 * GET /api/cluster/nodes
 */
export const getNodes = (req: Request, res: Response): void => {
  try {
    const mode = getClusterMode();
    
    if (mode !== 'coordinator') {
      res.status(403).json({
        success: false,
        message: 'This endpoint is only available on coordinator nodes',
      });
      return;
    }

    const activeOnly = req.query.active === 'true';
    const nodes = activeOnly ? getActiveNodes() : getAllNodes();

    res.json({
      success: true,
      data: nodes,
    });
  } catch (error) {
    console.error('Error getting nodes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get nodes',
    });
  }
};

/**
 * Get server replicas (coordinator only)
 * GET /api/cluster/servers/:serverId/replicas
 */
export const getReplicasForServer = (req: Request, res: Response): void => {
  try {
    const mode = getClusterMode();
    
    if (mode !== 'coordinator') {
      res.status(403).json({
        success: false,
        message: 'This endpoint is only available on coordinator nodes',
      });
      return;
    }

    const { serverId } = req.params;
    const replicas = getServerReplicas(serverId);

    res.json({
      success: true,
      data: replicas,
    });
  } catch (error) {
    console.error('Error getting server replicas:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get server replicas',
    });
  }
};

/**
 * Get session affinity information (coordinator only)
 * GET /api/cluster/sessions/:sessionId
 */
export const getSessionAffinityInfo = (req: Request, res: Response): void => {
  try {
    const mode = getClusterMode();
    
    if (mode !== 'coordinator') {
      res.status(403).json({
        success: false,
        message: 'This endpoint is only available on coordinator nodes',
      });
      return;
    }

    const { sessionId } = req.params;
    const affinity = getSessionAffinity(sessionId);

    if (!affinity) {
      res.status(404).json({
        success: false,
        message: 'Session affinity not found',
      });
      return;
    }

    res.json({
      success: true,
      data: affinity,
    });
  } catch (error) {
    console.error('Error getting session affinity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get session affinity',
    });
  }
};
