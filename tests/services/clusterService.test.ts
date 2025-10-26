/**
 * Cluster Service Tests
 */

import {
  isClusterEnabled,
  getClusterMode,
  getCurrentNodeId,
  registerNode,
  updateNodeHeartbeat,
  getActiveNodes,
  getAllNodes,
  getServerReplicas,
  getNodeForSession,
  getSessionAffinity,
  removeSessionAffinity,
  getClusterStats,
  shutdownClusterService,
} from '../../src/services/clusterService';
import { ClusterNode } from '../../src/types/index';

// Mock the config module
jest.mock('../../src/config/index.js', () => ({
  loadSettings: jest.fn(),
}));

const { loadSettings } = require('../../src/config/index.js');

describe('Cluster Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up cluster service to reset state
    shutdownClusterService();
  });

  describe('Configuration', () => {
    it('should return false when cluster is not enabled', () => {
      loadSettings.mockReturnValue({
        mcpServers: {},
      });

      expect(isClusterEnabled()).toBe(false);
    });

    it('should return true when cluster is enabled', () => {
      loadSettings.mockReturnValue({
        mcpServers: {},
        systemConfig: {
          cluster: {
            enabled: true,
            mode: 'coordinator',
          },
        },
      });

      expect(isClusterEnabled()).toBe(true);
    });

    it('should return standalone mode when cluster is not configured', () => {
      loadSettings.mockReturnValue({
        mcpServers: {},
      });

      expect(getClusterMode()).toBe('standalone');
    });

    it('should return configured mode when cluster is enabled', () => {
      loadSettings.mockReturnValue({
        mcpServers: {},
        systemConfig: {
          cluster: {
            enabled: true,
            mode: 'coordinator',
          },
        },
      });

      expect(getClusterMode()).toBe('coordinator');
    });
  });

  describe('Node Management', () => {
    beforeEach(() => {
      loadSettings.mockReturnValue({
        mcpServers: {},
        systemConfig: {
          cluster: {
            enabled: true,
            mode: 'coordinator',
          },
        },
      });
    });

    it('should register a new node', () => {
      const node: ClusterNode = {
        id: 'node-test-1',
        name: 'Test Node 1',
        host: 'localhost',
        port: 3001,
        url: 'http://localhost:3001',
        status: 'active',
        lastHeartbeat: Date.now(),
        servers: ['server1', 'server2'],
      };

      registerNode(node);
      const nodes = getAllNodes();

      // Find our node (there might be others from previous tests)
      const registeredNode = nodes.find(n => n.id === 'node-test-1');
      expect(registeredNode).toBeTruthy();
      expect(registeredNode?.name).toBe('Test Node 1');
      expect(registeredNode?.servers).toEqual(['server1', 'server2']);
    });

    it('should update node heartbeat', () => {
      const node: ClusterNode = {
        id: 'node-test-2',
        name: 'Test Node 2',
        host: 'localhost',
        port: 3001,
        url: 'http://localhost:3001',
        status: 'active',
        lastHeartbeat: Date.now() - 10000,
        servers: ['server1'],
      };

      registerNode(node);
      const beforeHeartbeat = getAllNodes().find(n => n.id === 'node-test-2')?.lastHeartbeat || 0;

      // Wait a bit to ensure timestamp changes
      setTimeout(() => {
        updateNodeHeartbeat('node-test-2', ['server1', 'server2']);
        const updatedNode = getAllNodes().find(n => n.id === 'node-test-2');
        const afterHeartbeat = updatedNode?.lastHeartbeat || 0;

        expect(afterHeartbeat).toBeGreaterThan(beforeHeartbeat);
        expect(updatedNode?.servers).toEqual(['server1', 'server2']);
      }, 10);
    });

    it('should get active nodes only', () => {
      const node1: ClusterNode = {
        id: 'node-active-1',
        name: 'Active Node',
        host: 'localhost',
        port: 3001,
        url: 'http://localhost:3001',
        status: 'active',
        lastHeartbeat: Date.now(),
        servers: ['server1'],
      };

      registerNode(node1);

      const activeNodes = getActiveNodes();
      const activeNode = activeNodes.find(n => n.id === 'node-active-1');
      expect(activeNode).toBeTruthy();
      expect(activeNode?.status).toBe('active');
    });
  });

  describe('Server Replicas', () => {
    beforeEach(() => {
      loadSettings.mockReturnValue({
        mcpServers: {},
        systemConfig: {
          cluster: {
            enabled: true,
            mode: 'coordinator',
          },
        },
      });
    });

    it('should track server replicas across nodes', () => {
      const node1: ClusterNode = {
        id: 'node-replica-1',
        name: 'Node 1',
        host: 'localhost',
        port: 3001,
        url: 'http://localhost:3001',
        status: 'active',
        lastHeartbeat: Date.now(),
        servers: ['test-server-1', 'test-server-2'],
      };

      const node2: ClusterNode = {
        id: 'node-replica-2',
        name: 'Node 2',
        host: 'localhost',
        port: 3002,
        url: 'http://localhost:3002',
        status: 'active',
        lastHeartbeat: Date.now(),
        servers: ['test-server-1', 'test-server-3'],
      };

      registerNode(node1);
      registerNode(node2);

      const server1Replicas = getServerReplicas('test-server-1');
      expect(server1Replicas.length).toBeGreaterThanOrEqual(2);
      expect(server1Replicas.map(r => r.nodeId)).toContain('node-replica-1');
      expect(server1Replicas.map(r => r.nodeId)).toContain('node-replica-2');
    });
  });

  describe('Session Affinity', () => {
    beforeEach(() => {
      loadSettings.mockReturnValue({
        mcpServers: {},
        systemConfig: {
          cluster: {
            enabled: true,
            mode: 'coordinator',
            stickySession: {
              enabled: true,
              strategy: 'consistent-hash',
            },
          },
        },
      });
    });

    it('should maintain session affinity with consistent hash', () => {
      const node1: ClusterNode = {
        id: 'node-affinity-1',
        name: 'Node 1',
        host: 'localhost',
        port: 3001,
        url: 'http://localhost:3001',
        status: 'active',
        lastHeartbeat: Date.now(),
        servers: ['server1'],
      };

      registerNode(node1);

      const sessionId = 'test-session-consistent-hash';
      const firstNode = getNodeForSession(sessionId);
      const secondNode = getNodeForSession(sessionId);

      expect(firstNode).toBeTruthy();
      expect(secondNode).toBeTruthy();
      expect(firstNode?.id).toBe(secondNode?.id);
    });

    it('should create and retrieve session affinity', () => {
      const node1: ClusterNode = {
        id: 'node-affinity-2',
        name: 'Node 1',
        host: 'localhost',
        port: 3001,
        url: 'http://localhost:3001',
        status: 'active',
        lastHeartbeat: Date.now(),
        servers: ['server1'],
      };

      registerNode(node1);

      const sessionId = 'test-session-retrieve';
      const selectedNode = getNodeForSession(sessionId);
      
      const affinity = getSessionAffinity(sessionId);
      expect(affinity).toBeTruthy();
      expect(affinity?.sessionId).toBe(sessionId);
      expect(affinity?.nodeId).toBe(selectedNode?.id);
    });

    it('should remove session affinity', () => {
      const node1: ClusterNode = {
        id: 'node-affinity-3',
        name: 'Node 1',
        host: 'localhost',
        port: 3001,
        url: 'http://localhost:3001',
        status: 'active',
        lastHeartbeat: Date.now(),
        servers: ['server1'],
      };

      registerNode(node1);

      const sessionId = 'test-session-remove';
      getNodeForSession(sessionId);
      
      let affinity = getSessionAffinity(sessionId);
      expect(affinity).toBeTruthy();

      removeSessionAffinity(sessionId);
      affinity = getSessionAffinity(sessionId);
      expect(affinity).toBeNull();
    });
  });

  describe('Cluster Statistics', () => {
    beforeEach(() => {
      loadSettings.mockReturnValue({
        mcpServers: {},
        systemConfig: {
          cluster: {
            enabled: true,
            mode: 'coordinator',
          },
        },
      });
    });

    it('should return cluster statistics', () => {
      const node1: ClusterNode = {
        id: 'node-stats-1',
        name: 'Node 1',
        host: 'localhost',
        port: 3001,
        url: 'http://localhost:3001',
        status: 'active',
        lastHeartbeat: Date.now(),
        servers: ['unique-server-1', 'unique-server-2'],
      };

      registerNode(node1);

      const stats = getClusterStats();
      expect(stats.nodes).toBeGreaterThanOrEqual(1);
      expect(stats.activeNodes).toBeGreaterThanOrEqual(1);
      expect(stats.servers).toBeGreaterThanOrEqual(2);
    });
  });
});
