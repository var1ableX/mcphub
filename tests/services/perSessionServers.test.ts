import {
  getOrCreatePerSessionServer,
  cleanupPerSessionServers,
  handleCallToolRequest,
} from '../../src/services/mcpService';
import { ServerConfig } from '../../src/types';

// Mock the serverDao
jest.mock('../../src/dao/index.js', () => ({
  getServerDao: () => ({
    findById: jest.fn((name: string) => {
      if (name === 'playwright') {
        return Promise.resolve({
          name: 'playwright',
          command: 'npx',
          args: ['@playwright/mcp@latest', '--headless', '--isolated'],
          perSession: true,
          enabled: true,
        });
      }
      return Promise.resolve(null);
    }),
    findAll: jest.fn(() => Promise.resolve([])),
  }),
}));

// Mock the Client and Transport classes
jest.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    connect: jest.fn(() => Promise.resolve()),
    close: jest.fn(),
    listTools: jest.fn(() => Promise.resolve({ tools: [] })),
    listPrompts: jest.fn(() => Promise.resolve({ prompts: [] })),
    getServerCapabilities: jest.fn(() => ({ tools: true, prompts: true })),
    callTool: jest.fn((params) => Promise.resolve({ content: [{ type: 'text', text: `Tool ${params.name} called` }] })),
  })),
}));

jest.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: jest.fn().mockImplementation(() => ({
    close: jest.fn(),
    stderr: {
      on: jest.fn(),
    },
  })),
}));

describe('Per-Session Server Instances', () => {
  afterEach(() => {
    // Clean up any created sessions
    cleanupPerSessionServers('session1');
    cleanupPerSessionServers('session2');
  });

  it('should create separate server instances for different sessions', async () => {
    const config: ServerConfig = {
      command: 'npx',
      args: ['@playwright/mcp@latest', '--headless', '--isolated'],
      perSession: true,
    };

    // Create server for session1
    const server1 = await getOrCreatePerSessionServer('session1', 'playwright', config);
    expect(server1).toBeDefined();
    expect(server1.sessionId).toBe('session1');

    // Create server for session2
    const server2 = await getOrCreatePerSessionServer('session2', 'playwright', config);
    expect(server2).toBeDefined();
    expect(server2.sessionId).toBe('session2');

    // They should be different instances
    expect(server1).not.toBe(server2);
  });

  it('should reuse existing per-session server for the same session', async () => {
    const config: ServerConfig = {
      command: 'npx',
      args: ['@playwright/mcp@latest', '--headless', '--isolated'],
      perSession: true,
    };

    // Create server for session1
    const server1 = await getOrCreatePerSessionServer('session1', 'playwright', config);
    
    // Request the same server again
    const server2 = await getOrCreatePerSessionServer('session1', 'playwright', config);

    // Should be the same instance
    expect(server1).toBe(server2);
  });

  it('should clean up per-session servers when session ends', async () => {
    const config: ServerConfig = {
      command: 'npx',
      args: ['@playwright/mcp@latest', '--headless', '--isolated'],
      perSession: true,
    };

    // Create server for session1
    const server1 = await getOrCreatePerSessionServer('session1', 'playwright', config);
    expect(server1).toBeDefined();

    // Clean up session1
    cleanupPerSessionServers('session1');

    // Create again should create a new instance (not the same object)
    const server2 = await getOrCreatePerSessionServer('session1', 'playwright', config);
    expect(server2).toBeDefined();
    expect(server2).not.toBe(server1);
  });
});
