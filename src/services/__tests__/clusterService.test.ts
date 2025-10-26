import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let clusterService: import('../clusterService.js').ClusterService;
let tempDir: string;

beforeAll(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcphub-cluster-'));
  const settingsPath = path.join(tempDir, 'mcp_settings.json');
  process.env.MCPHUB_SETTING_PATH = settingsPath;

  const settings = {
    systemConfig: {
      cluster: {
        enabled: true,
        nodeId: 'test-node',
        baseUrl: 'http://127.0.0.1:3000',
        coordinator: { type: 'memory' as const },
      },
    },
    mcpServers: {},
  };

  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

  const module = await import('../clusterService.js');
  clusterService = module.clusterService;
});

afterAll(async () => {
  if (clusterService) {
    await clusterService.shutdown();
  }

  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
  delete process.env.MCPHUB_SETTING_PATH;
});

describe('ClusterService (memory coordinator)', () => {
  afterEach(async () => {
    await clusterService.shutdown();
  });

  it('registers servers and sessions locally', async () => {
    await clusterService.initialize();

    await clusterService.registerLocalServers([
      { name: 'alpha', status: 'connected', metadata: {} },
    ]);

    const nodes = await clusterService.getActiveNodes();
    expect(nodes).toHaveLength(1);
    expect(nodes[0].nodeId).toBe('test-node');
    expect(nodes[0].servers[0].name).toBe('alpha');

    await clusterService.recordSession('session-1', { group: 'default', user: 'tester' });
    const stored = await clusterService.getSession('session-1');
    expect(stored?.nodeId).toBe('test-node');
    expect(stored?.group).toBe('default');

    await clusterService.clearSession('session-1');
    const cleared = await clusterService.getSession('session-1');
    expect(cleared).toBeNull();
  });
});
