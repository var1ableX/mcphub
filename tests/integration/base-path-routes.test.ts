import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';

// Mock dependencies
jest.mock('../../src/utils/i18n.js', () => ({
  __esModule: true,
  initI18n: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/models/User.js', () => ({
  __esModule: true,
  initializeDefaultUser: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/oauthService.js', () => ({
  __esModule: true,
  initOAuthProvider: jest.fn(),
  getOAuthRouter: jest.fn(() => null),
}));

jest.mock('../../src/services/mcpService.js', () => ({
  __esModule: true,
  initUpstreamServers: jest.fn().mockResolvedValue(undefined),
  connected: jest.fn().mockReturnValue(true),
}));

jest.mock('../../src/middlewares/userContext.js', () => ({
  __esModule: true,
  userContextMiddleware: jest.fn((_req, _res, next) => next()),
  sseUserContextMiddleware: jest.fn((_req, _res, next) => next()),
}));

describe('AppServer with BASE_PATH configuration', () => {
  // Save original BASE_PATH
  const originalBasePath = process.env.BASE_PATH;
  
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear module cache to allow fresh imports with different config
    jest.resetModules();
  });
  
  afterEach(() => {
    // Restore original BASE_PATH or remove it
    if (originalBasePath !== undefined) {
      process.env.BASE_PATH = originalBasePath;
    } else {
      delete process.env.BASE_PATH;
    }
  });

  const flushPromises = async () => {
    await new Promise((resolve) => setImmediate(resolve));
  };

  it('should serve auth routes with BASE_PATH=/mcphub/', async () => {
    // Set environment variable for BASE_PATH (with trailing slash)
    process.env.BASE_PATH = '/mcphub/';
    
    // Dynamically import after setting env var
    const { AppServer } = await import('../../src/server.js');
    const config = await import('../../src/config/index.js');
    
    // Verify config loaded the BASE_PATH and normalized it (removed trailing slash)
    expect(config.default.basePath).toBe('/mcphub');
    
    const appServer = new AppServer();
    await appServer.initialize();
    await flushPromises();
    
    const app = appServer.getApp();
    
    // Test that /mcphub/config endpoint exists
    const configResponse = await request(app).get('/mcphub/config');
    expect(configResponse.status).not.toBe(404);
    
    // Test that /mcphub/public-config endpoint exists
    const publicConfigResponse = await request(app).get('/mcphub/public-config');
    expect(publicConfigResponse.status).not.toBe(404);
  });

  it('should serve auth routes without BASE_PATH (default)', async () => {
    // Ensure BASE_PATH is not set
    delete process.env.BASE_PATH;
    
    // Dynamically import after clearing env var
    jest.resetModules();
    const { AppServer } = await import('../../src/server.js');
    const config = await import('../../src/config/index.js');
    
    // Verify config has empty BASE_PATH
    expect(config.default.basePath).toBe('');
    
    const appServer = new AppServer();
    await appServer.initialize();
    await flushPromises();
    
    const app = appServer.getApp();
    
    // Test that /config endpoint exists (without base path)
    const configResponse = await request(app).get('/config');
    expect(configResponse.status).not.toBe(404);
    
    // Test that /public-config endpoint exists
    const publicConfigResponse = await request(app).get('/public-config');
    expect(publicConfigResponse.status).not.toBe(404);
  });

  it('should serve global endpoints without BASE_PATH prefix', async () => {
    process.env.BASE_PATH = '/test-base/';
    
    jest.resetModules();
    const { AppServer } = await import('../../src/server.js');
    
    const appServer = new AppServer();
    await appServer.initialize();
    await flushPromises();
    
    const app = appServer.getApp();
    
    // Test that /health endpoint is accessible globally (no BASE_PATH prefix)
    // The /health endpoint is intentionally mounted without BASE_PATH
    const healthResponse = await request(app).get('/health');
    expect(healthResponse.status).not.toBe(404);
    
    // Also verify that BASE_PATH prefixed routes exist
    const configResponse = await request(app).get('/test-base/config');
    expect(configResponse.status).not.toBe(404);
  });
});
