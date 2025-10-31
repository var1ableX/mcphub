import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock dependencies before importing mcpService
jest.mock('../../src/services/oauthService.js', () => ({
  initializeAllOAuthClients: jest.fn(),
}));

jest.mock('../../src/services/oauthClientRegistration.js', () => ({
  registerOAuthClient: jest.fn(),
}));

jest.mock('../../src/services/mcpOAuthProvider.js', () => ({
  createOAuthProvider: jest.fn(),
}));

jest.mock('../../src/services/groupService.js', () => ({
  getServersInGroup: jest.fn(),
  getServerConfigInGroup: jest.fn(),
}));

jest.mock('../../src/services/sseService.js', () => ({
  getGroup: jest.fn(),
}));

jest.mock('../../src/services/vectorSearchService.js', () => ({
  saveToolsAsVectorEmbeddings: jest.fn(),
  searchToolsByVector: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../../src/services/services.js', () => ({
  getDataService: jest.fn(() => ({
    filterData: (data: any) => data,
  })),
}));

jest.mock('../../src/config/index.js', () => ({
  default: {
    mcpHubName: 'test-hub',
    mcpHubVersion: '1.0.0',
    initTimeout: 60000,
  },
  loadSettings: jest.fn(() => ({})),
  expandEnvVars: jest.fn((val: string) => val),
  replaceEnvVars: jest.fn((obj: any) => obj),
  getNameSeparator: jest.fn(() => '-'),
}));

// Mock Client
const mockClient = {
  connect: jest.fn(),
  close: jest.fn(),
  listTools: jest.fn(),
  listPrompts: jest.fn(),
  getServerCapabilities: jest.fn(() => ({
    tools: {},
    prompts: {},
  })),
  callTool: jest.fn(),
};

jest.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: jest.fn(() => mockClient),
}));

// Mock StdioClientTransport
const mockTransport = {
  close: jest.fn(),
  stderr: null,
};

jest.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: jest.fn(() => mockTransport),
}));

// Mock DAO
const mockServerDao = {
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  exists: jest.fn(),
  setEnabled: jest.fn(),
};

jest.mock('../../src/dao/index.js', () => ({
  getServerDao: jest.fn(() => mockServerDao),
}));

import { initializeClientsFromSettings, handleCallToolRequest } from '../../src/services/mcpService.js';

describe('On-Demand MCP Server Connection Mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.connect.mockResolvedValue(undefined);
    mockClient.close.mockReturnValue(undefined);
    mockClient.listTools.mockResolvedValue({
      tools: [
        {
          name: 'test-tool',
          description: 'Test tool',
          inputSchema: { type: 'object' },
        },
      ],
    });
    mockClient.listPrompts.mockResolvedValue({
      prompts: [],
    });
    mockClient.callTool.mockResolvedValue({
      content: [{ type: 'text', text: 'Success' }],
    });
    mockTransport.close.mockReturnValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Server Initialization', () => {
    it('should not maintain persistent connection for on-demand servers', async () => {
      mockServerDao.findAll.mockResolvedValue([
        {
          name: 'on-demand-server',
          command: 'node',
          args: ['test.js'],
          connectionMode: 'on-demand',
          enabled: true,
        },
      ]);

      const serverInfos = await initializeClientsFromSettings(true);

      expect(serverInfos).toHaveLength(1);
      expect(serverInfos[0].name).toBe('on-demand-server');
      expect(serverInfos[0].connectionMode).toBe('on-demand');
      expect(serverInfos[0].status).toBe('disconnected');
      // Should connect once to get tools, then disconnect
      expect(mockClient.connect).toHaveBeenCalledTimes(1);
      expect(mockTransport.close).toHaveBeenCalledTimes(1);
    });

    it('should load tools during initialization for on-demand servers', async () => {
      mockServerDao.findAll.mockResolvedValue([
        {
          name: 'on-demand-server',
          command: 'node',
          args: ['test.js'],
          connectionMode: 'on-demand',
          enabled: true,
        },
      ]);

      const serverInfos = await initializeClientsFromSettings(true);

      expect(serverInfos[0].tools).toHaveLength(1);
      expect(serverInfos[0].tools[0].name).toBe('on-demand-server-test-tool');
      expect(mockClient.listTools).toHaveBeenCalled();
    });

    it('should maintain persistent connection for default connection mode', async () => {
      mockServerDao.findAll.mockResolvedValue([
        {
          name: 'persistent-server',
          command: 'node',
          args: ['test.js'],
          enabled: true,
        },
      ]);

      const serverInfos = await initializeClientsFromSettings(true);

      expect(serverInfos).toHaveLength(1);
      expect(serverInfos[0].connectionMode).toBe('persistent');
      expect(mockClient.connect).toHaveBeenCalledTimes(1);
      // Should not disconnect immediately
      expect(mockTransport.close).not.toHaveBeenCalled();
    });

    it('should handle initialization errors for on-demand servers gracefully', async () => {
      mockClient.connect.mockRejectedValueOnce(new Error('Connection failed'));
      mockServerDao.findAll.mockResolvedValue([
        {
          name: 'failing-server',
          command: 'node',
          args: ['test.js'],
          connectionMode: 'on-demand',
          enabled: true,
        },
      ]);

      const serverInfos = await initializeClientsFromSettings(true);

      expect(serverInfos).toHaveLength(1);
      expect(serverInfos[0].status).toBe('disconnected');
      expect(serverInfos[0].error).toContain('Failed to initialize');
    });
  });

  describe('Tool Invocation with On-Demand Servers', () => {
    beforeEach(async () => {
      // Set up server infos with an on-demand server that's disconnected
      mockServerDao.findAll.mockResolvedValue([
        {
          name: 'on-demand-server',
          command: 'node',
          args: ['test.js'],
          connectionMode: 'on-demand',
          enabled: true,
        },
      ]);

      // Initialize to get the server set up
      await initializeClientsFromSettings(true);
      
      // Clear mocks after initialization
      jest.clearAllMocks();
      
      // Reset mock implementations
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.listTools.mockResolvedValue({
        tools: [
          {
            name: 'test-tool',
            description: 'Test tool',
            inputSchema: { type: 'object' },
          },
        ],
      });
      mockClient.callTool.mockResolvedValue({
        content: [{ type: 'text', text: 'Success' }],
      });
    });

    it('should connect on-demand server before tool invocation', async () => {
      const request = {
        params: {
          name: 'on-demand-server-test-tool',
          arguments: { arg1: 'value1' },
        },
      };

      await handleCallToolRequest(request, {});

      // Should connect before calling the tool
      expect(mockClient.connect).toHaveBeenCalledTimes(1);
      expect(mockClient.callTool).toHaveBeenCalledWith(
        {
          name: 'test-tool',
          arguments: { arg1: 'value1' },
        },
        undefined,
        expect.any(Object),
      );
    });

    it('should disconnect on-demand server after tool invocation', async () => {
      const request = {
        params: {
          name: 'on-demand-server-test-tool',
          arguments: {},
        },
      };

      await handleCallToolRequest(request, {});

      // Should disconnect after calling the tool
      expect(mockTransport.close).toHaveBeenCalledTimes(1);
      expect(mockClient.close).toHaveBeenCalledTimes(1);
    });

    it('should disconnect on-demand server even if tool invocation fails', async () => {
      mockClient.callTool.mockRejectedValueOnce(new Error('Tool execution failed'));

      const request = {
        params: {
          name: 'on-demand-server-test-tool',
          arguments: {},
        },
      };

      try {
        await handleCallToolRequest(request, {});
      } catch (error) {
        // Expected to fail
      }

      // Should still disconnect after error
      expect(mockTransport.close).toHaveBeenCalledTimes(1);
      expect(mockClient.close).toHaveBeenCalledTimes(1);
    });

    it('should return error for call_tool if server not found', async () => {
      const request = {
        params: {
          name: 'call_tool',
          arguments: {
            toolName: 'nonexistent-server-tool',
            arguments: {},
          },
        },
      };

      const result = await handleCallToolRequest(request, {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No available servers found');
    });
  });

  describe('Mixed Server Modes', () => {
    it('should handle both persistent and on-demand servers together', async () => {
      mockServerDao.findAll.mockResolvedValue([
        {
          name: 'persistent-server',
          command: 'node',
          args: ['persistent.js'],
          enabled: true,
        },
        {
          name: 'on-demand-server',
          command: 'node',
          args: ['on-demand.js'],
          connectionMode: 'on-demand',
          enabled: true,
        },
      ]);

      const serverInfos = await initializeClientsFromSettings(true);

      expect(serverInfos).toHaveLength(2);
      
      const persistentServer = serverInfos.find(s => s.name === 'persistent-server');
      const onDemandServer = serverInfos.find(s => s.name === 'on-demand-server');

      expect(persistentServer?.connectionMode).toBe('persistent');
      expect(onDemandServer?.connectionMode).toBe('on-demand');
      expect(onDemandServer?.status).toBe('disconnected');
    });
  });
});
