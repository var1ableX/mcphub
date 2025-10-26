import { ClusterConfig, ClusterNodeConfig } from '../types/index.js';
import { getClusterConfig } from '../config/index.js';

export interface ClusterServerSnapshot {
  name: string;
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface ClusterNodeState {
  nodeId: string;
  baseUrl: string;
  servers: ClusterServerSnapshot[];
  lastHeartbeat: number;
  metadata?: Record<string, unknown>;
}

export interface ClusterSessionRecord {
  sessionId: string;
  nodeId: string;
  group?: string;
  user?: string;
  createdAt: number;
  updatedAt: number;
}

interface ClusterAdapter {
  initialize(config: ClusterConfig): Promise<void>;
  shutdown(): Promise<void>;
  upsertNode(node: ClusterNodeState): Promise<void>;
  getNode(nodeId: string): Promise<ClusterNodeState | null>;
  getNodes(): Promise<ClusterNodeState[]>;
  removeNode(nodeId: string): Promise<void>;
  recordSession(session: ClusterSessionRecord, ttlSeconds?: number): Promise<void>;
  getSession(sessionId: string): Promise<ClusterSessionRecord | null>;
  clearSession(sessionId: string): Promise<void>;
}

class MemoryClusterAdapter implements ClusterAdapter {
  private nodes = new Map<string, ClusterNodeState>();
  private sessions = new Map<string, ClusterSessionRecord>();

  async initialize(): Promise<void> {
    // nothing to do
  }

  async shutdown(): Promise<void> {
    this.nodes.clear();
    this.sessions.clear();
  }

  async upsertNode(node: ClusterNodeState): Promise<void> {
    this.nodes.set(node.nodeId, { ...node });
  }

  async getNode(nodeId: string): Promise<ClusterNodeState | null> {
    const node = this.nodes.get(nodeId);
    return node ? { ...node, servers: [...node.servers] } : null;
  }

  async getNodes(): Promise<ClusterNodeState[]> {
    return Array.from(this.nodes.values()).map((node) => ({
      ...node,
      servers: [...node.servers],
    }));
  }

  async removeNode(nodeId: string): Promise<void> {
    this.nodes.delete(nodeId);
  }

  async recordSession(session: ClusterSessionRecord): Promise<void> {
    this.sessions.set(session.sessionId, { ...session });
  }

  async getSession(sessionId: string): Promise<ClusterSessionRecord | null> {
    const session = this.sessions.get(sessionId);
    return session ? { ...session } : null;
  }

  async clearSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
}

class RedisClusterAdapter implements ClusterAdapter {
  private redis: any = null;
  private config!: ClusterConfig;
  private nodesKey!: string;
  private sessionKeyPrefix!: string;

  async initialize(config: ClusterConfig): Promise<void> {
    const redisUrl = config.coordinator?.redisUrl;
    if (!redisUrl) {
      throw new Error('Redis cluster coordinator requires coordinator.redisUrl');
    }

    this.config = config;
    let RedisClient: any;
    try {
      const redisModule = await import('ioredis');
      RedisClient = redisModule.default;
    } catch (error) {
      throw new Error(
        `Failed to load ioredis. Ensure the dependency is installed before enabling Redis coordinator. Original error: ${error}`,
      );
    }
    this.redis = new RedisClient(redisUrl);

    const keyPrefix = config.coordinator?.keyPrefix || 'mcphub:cluster';
    this.nodesKey = `${keyPrefix}:nodes`;
    this.sessionKeyPrefix = `${keyPrefix}:session`;
  }

  async shutdown(): Promise<void> {
    await this.redis?.quit();
    this.redis = null;
  }

  async upsertNode(node: ClusterNodeState): Promise<void> {
    await this.ensureRedis();
    await this.redis!.hset(this.nodesKey, node.nodeId, JSON.stringify(node));
  }

  async getNode(nodeId: string): Promise<ClusterNodeState | null> {
    await this.ensureRedis();
    const raw = await this.redis!.hget(this.nodesKey, nodeId);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as ClusterNodeState;
  }

  async getNodes(): Promise<ClusterNodeState[]> {
    await this.ensureRedis();
    const entries = (await this.redis!.hgetall(this.nodesKey)) as Record<string, string>;
    return Object.values(entries).map((raw) => JSON.parse(raw) as ClusterNodeState);
  }

  async removeNode(nodeId: string): Promise<void> {
    await this.ensureRedis();
    await this.redis!.hdel(this.nodesKey, nodeId);
  }

  async recordSession(session: ClusterSessionRecord, ttlSeconds?: number): Promise<void> {
    await this.ensureRedis();
    const key = this.getSessionKey(session.sessionId);
    if (ttlSeconds && ttlSeconds > 0) {
      await this.redis!.set(key, JSON.stringify(session), 'EX', ttlSeconds);
    } else {
      await this.redis!.set(key, JSON.stringify(session));
    }
  }

  async getSession(sessionId: string): Promise<ClusterSessionRecord | null> {
    await this.ensureRedis();
    const raw = await this.redis!.get(this.getSessionKey(sessionId));
    return raw ? ((JSON.parse(raw) as ClusterSessionRecord) ?? null) : null;
  }

  async clearSession(sessionId: string): Promise<void> {
    await this.ensureRedis();
    await this.redis!.del(this.getSessionKey(sessionId));
  }

  private getSessionKey(sessionId: string): string {
    return `${this.sessionKeyPrefix}:${sessionId}`;
  }

  private async ensureRedis(): Promise<void> {
    if (!this.redis) {
      throw new Error('Redis connection not initialized');
    }
  }
}

export class ClusterService {
  private static instance: ClusterService;
  private adapter: ClusterAdapter | null = null;
  private config: ClusterConfig | undefined;
  private localNode: ClusterNodeState | null = null;
  private initialized = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  static getInstance(): ClusterService {
    if (!ClusterService.instance) {
      ClusterService.instance = new ClusterService();
    }
    return ClusterService.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const clusterConfig = getClusterConfig();
    this.config = clusterConfig;

    if (!clusterConfig?.enabled) {
      this.initialized = true;
      return;
    }

    if (!clusterConfig.nodeId) {
      throw new Error('Cluster configuration requires a nodeId');
    }

    if (!clusterConfig.baseUrl) {
      throw new Error('Cluster configuration requires a baseUrl for the local node');
    }

    this.adapter = this.createAdapter(clusterConfig);
    await this.adapter.initialize(clusterConfig);

    this.localNode = {
      nodeId: clusterConfig.nodeId,
      baseUrl: clusterConfig.baseUrl,
      servers: [],
      lastHeartbeat: Date.now(),
      metadata: {},
    };

    await this.adapter.upsertNode(this.localNode);
    this.startHeartbeat();

    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    await this.adapter?.removeNode(this.config?.nodeId || '');
    await this.adapter?.shutdown();

    this.adapter = null;
    this.localNode = null;
    this.initialized = false;
  }

  isEnabled(): boolean {
    return Boolean(this.config?.enabled);
  }

  getLocalNodeId(): string | undefined {
    return this.config?.nodeId;
  }

  async registerLocalServers(servers: ClusterServerSnapshot[]): Promise<void> {
    if (!this.isEnabled() || !this.adapter || !this.localNode) {
      return;
    }

    this.localNode.servers = servers;
    this.localNode.lastHeartbeat = Date.now();
    await this.adapter.upsertNode(this.localNode);
  }

  async recordSession(sessionId: string, metadata: { group?: string; user?: string } = {}): Promise<void> {
    if (!this.isEnabled() || !this.adapter || !this.config) {
      return;
    }

    const now = Date.now();
    const record: ClusterSessionRecord = {
      sessionId,
      nodeId: this.config.nodeId,
      group: metadata.group,
      user: metadata.user,
      createdAt: now,
      updatedAt: now,
    };

    const ttlSeconds = this.config.session?.ttlSeconds;
    await this.adapter.recordSession(record, ttlSeconds);
  }

  async getSession(sessionId: string): Promise<ClusterSessionRecord | null> {
    if (!this.isEnabled() || !this.adapter) {
      return null;
    }
    return this.adapter.getSession(sessionId);
  }

  async clearSession(sessionId: string): Promise<void> {
    if (!this.isEnabled() || !this.adapter) {
      return;
    }
    await this.adapter.clearSession(sessionId);
  }

  async getActiveNodes(): Promise<ClusterNodeState[]> {
    if (!this.isEnabled() || !this.adapter) {
      return this.localNode ? [this.localNode] : [];
    }

    const nodes = await this.adapter.getNodes();
    const offlineAfter = this.config?.coordinator?.offlineAfterMs || 45000;
    const now = Date.now();
    return nodes.filter((node) => now - node.lastHeartbeat <= offlineAfter);
  }

  async getNode(nodeId: string): Promise<ClusterNodeState | null> {
    if (!this.isEnabled() || !this.adapter) {
      return this.localNode && this.localNode.nodeId === nodeId ? this.localNode : null;
    }
    return this.adapter.getNode(nodeId);
  }

  async getNodeBaseUrl(nodeId: string): Promise<string | null> {
    if (!this.config) {
      return null;
    }

    if (nodeId === this.config.nodeId) {
      return this.config.baseUrl;
    }

    const explicitNode = this.config.nodes?.find((node) => node.nodeId === nodeId);
    if (explicitNode) {
      return explicitNode.baseUrl;
    }

    if (this.isEnabled() && this.adapter) {
      const node = await this.adapter.getNode(nodeId);
      if (node) {
        return node.baseUrl;
      }
    }

    return null;
  }

  private startHeartbeat(): void {
    if (!this.adapter || !this.localNode || !this.config) {
      return;
    }

    const interval = this.config.coordinator?.heartbeatIntervalMs || 10000;
    this.heartbeatTimer = setInterval(async () => {
      if (!this.adapter || !this.localNode) {
        return;
      }
      this.localNode.lastHeartbeat = Date.now();
      try {
        await this.adapter.upsertNode(this.localNode);
      } catch (error) {
        console.error('Failed to publish cluster heartbeat:', error);
      }
    }, interval);
    if (typeof this.heartbeatTimer?.unref === 'function') {
      this.heartbeatTimer.unref();
    }
  }

  private createAdapter(config: ClusterConfig): ClusterAdapter {
    if (config.coordinator?.type === 'redis') {
      return new RedisClusterAdapter();
    }
    return new MemoryClusterAdapter();
  }
}

export const clusterService = ClusterService.getInstance();
