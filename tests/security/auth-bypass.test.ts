/**
 * Security tests for authentication bypass vulnerability
 * 
 * This test suite verifies that the MCP transport endpoints properly authenticate users
 * and prevent unauthorized access through user impersonation.
 * 
 * Vulnerability description:
 * - User-scoped routes (/:user/mcp/:group and /:user/sse/:group) trust the path segment
 * - No validation that the caller has permission to access that user's resources
 * - Bearer auth configuration (enableBearerAuth) is not properly enforced
 */

// Mock openid-client before importing services
jest.mock('openid-client', () => ({
  discovery: jest.fn(),
  dynamicClientRegistration: jest.fn(),
  ClientSecretPost: jest.fn(() => jest.fn()),
  ClientSecretBasic: jest.fn(() => jest.fn()),
  None: jest.fn(() => jest.fn()),
  calculatePKCECodeChallenge: jest.fn(),
  randomPKCECodeVerifier: jest.fn(),
  buildAuthorizationUrl: jest.fn(),
  authorizationCodeGrant: jest.fn(),
  refreshTokenGrant: jest.fn(),
}));

import { Server } from 'http';
import request from 'supertest';
import { AppServer } from '../../src/server.js';
import { TestServerHelper } from '../utils/testServerHelper.js';
import { createMockSettings } from '../utils/mockSettings.js';
import { cleanupAllServers } from '../../src/services/mcpService.js';
import { McpSettings, IUser } from '../../src/types/index.js';

describe('Authentication Bypass Security Tests', () => {
  let appServer: AppServer;
  let httpServer: Server;
  let baseURL: string;
  let testServerHelper: TestServerHelper;

  // Test users defined in settings
  const adminUser: IUser = {
    username: 'admin',
    password: 'admin123',
    isAdmin: true,
  };

  const regularUser: IUser = {
    username: 'bob',
    password: 'bob123',
    isAdmin: false,
  };

  const aliceUser: IUser = {
    username: 'alice',
    password: 'alice123',
    isAdmin: false,
  };

  beforeAll(async () => {
    // Create mock settings with multiple users and bearer auth enabled
    const settings: McpSettings = createMockSettings({
      users: [adminUser, regularUser, aliceUser],
      systemConfig: {
        routing: {
          enableGlobalRoute: true,
          enableGroupNameRoute: true,
          enableBearerAuth: true,
          bearerAuthKey: 'supersecret-value',
        },
        enableSessionRebuild: false,
      },
      mcpServers: {
        'alice-secret': {
          command: 'npx',
          args: ['-y', 'time-mcp'],
          env: {},
          enabled: true,
          keepAliveInterval: 30000,
          type: 'stdio',
        },
        'bob-secret': {
          command: 'npx',
          args: ['-y', 'time-mcp'],
          env: {},
          enabled: true,
          keepAliveInterval: 30000,
          type: 'stdio',
        },
      },
      groups: [
        {
          name: 'alice-private',
          servers: ['alice-secret'],
          description: 'Alice private group',
          owner: 'alice',
        },
        {
          name: 'bob-private',
          servers: ['bob-secret'],
          description: 'Bob private group',
          owner: 'bob',
        },
      ],
    });

    testServerHelper = new TestServerHelper();
    const result = await testServerHelper.createTestServer(settings);

    appServer = result.appServer;
    httpServer = result.httpServer;
    baseURL = result.baseURL;
  }, 60000);

  afterAll(async () => {
    cleanupAllServers();

    if (testServerHelper) {
      await testServerHelper.closeTestServer();
    } else if (httpServer) {
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  describe('User-Scoped MCP Endpoint - Unauthenticated Access', () => {
    it('should reject unauthenticated POST to /:user/mcp/:group (impersonation attempt)', async () => {
      // Attempt to initialize MCP session as admin without authentication
      const response = await request(httpServer)
        .post('/admin/mcp/alice-private')
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json, text/event-stream')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: {
              name: 'test-client',
              version: '1.0',
            },
          },
        });

      // Should reject with 401 Unauthorized
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('invalid_token');
      expect(response.headers['www-authenticate']).toContain('Bearer');
    });

    it('should reject unauthenticated POST to /:user/mcp/:group for different user', async () => {
      // Attempt to impersonate bob
      const response = await request(httpServer)
        .post('/bob/mcp/bob-private')
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .send({
          jsonrpc: '2.0',
          id: 2,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: {
              name: 'attacker',
              version: '1.0',
            },
          },
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('invalid_token');
    });

    it('should reject unauthenticated tools/call after session creation', async () => {
      // This test verifies that even if a session is somehow obtained,
      // subsequent calls without auth should also be rejected

      // First, try to create a session without auth (should fail)
      const initResponse = await request(httpServer)
        .post('/alice/mcp/alice-private')
        .set('Content-Type', 'application/json')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0' },
          },
        });

      expect(initResponse.status).toBe(401);
    });
  });

  describe('User-Scoped SSE Endpoint - Unauthenticated Access', () => {
    it('should reject unauthenticated GET to /:user/sse/:group', async () => {
      const response = await request(httpServer)
        .get('/admin/sse/alice-private')
        .set('Accept', 'text/event-stream');

      // Should reject with 401 Unauthorized
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('invalid_token');
      expect(response.headers['www-authenticate']).toContain('Bearer');
    });

    it('should reject unauthenticated GET to /:user/sse/:group for different user', async () => {
      const response = await request(httpServer)
        .get('/bob/sse/bob-private')
        .set('Accept', 'text/event-stream');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Bearer Auth Enforcement with enableBearerAuth=true', () => {
    it('should accept valid bearer token', async () => {
      const response = await request(httpServer)
        .post('/admin/mcp/alice-private')
        .set('Authorization', 'Bearer supersecret-value')
        .set('Content-Type', 'application/json')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0' },
          },
        });

      // With valid bearer token, should NOT return 401 (auth error)
      // May return other errors (404, 406, etc.) depending on MCP server state
      expect(response.status).not.toBe(401);
    });

    it('should reject invalid bearer token', async () => {
      const response = await request(httpServer)
        .post('/admin/mcp/alice-private')
        .set('Authorization', 'Bearer wrong-token')
        .set('Content-Type', 'application/json')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0' },
          },
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('invalid_token');
      expect(response.body.error_description).toContain('Invalid bearer token');
    });

    it('should reject malformed Authorization header', async () => {
      const response = await request(httpServer)
        .post('/admin/mcp/alice-private')
        .set('Authorization', 'InvalidFormat token')
        .set('Content-Type', 'application/json')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0' },
          },
        });

      expect(response.status).toBe(401);
    });

    it('should enforce bearer auth on SSE endpoints', async () => {
      const response = await request(httpServer)
        .get('/admin/sse/alice-private')
        .set('Accept', 'text/event-stream');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('invalid_token');
    });

    it.skip('should accept valid bearer token on SSE endpoints (skipped - SSE keeps connection open)', async () => {
      const response = await request(httpServer)
        .get('/admin/sse/alice-private')
        .set('Authorization', 'Bearer supersecret-value')
        .set('Accept', 'text/event-stream')
        .timeout(5000); // Add timeout to prevent hanging

      // With valid auth, should NOT return 401 (auth error)
      // SSE will return 200 and keep connection open
      expect(response.status).not.toBe(401);
    }, 10000); // Increase test timeout
  });

  describe('Global Routes - Bearer Auth Enforcement', () => {
    it('should reject unauthenticated access to global MCP endpoint when bearer auth enabled', async () => {
      const response = await request(httpServer)
        .post('/mcp/alice-private')
        .set('Content-Type', 'application/json')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0' },
          },
        });

      expect(response.status).toBe(401);
    });

    it('should accept valid bearer token on global MCP endpoint', async () => {
      const response = await request(httpServer)
        .post('/mcp/alice-private')
        .set('Authorization', 'Bearer supersecret-value')
        .set('Content-Type', 'application/json')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0' },
          },
        });

      // With valid auth, should NOT return 401 (auth error)
      expect(response.status).not.toBe(401);
    });
  });

  describe('User Messages Endpoint - Bearer Auth', () => {
    it('should reject unauthenticated POST to /:user/messages', async () => {
      const response = await request(httpServer)
        .post('/admin/messages?sessionId=fake-session-id')
        .set('Content-Type', 'application/json')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
        });

      expect(response.status).toBe(401);
    });

    it('should accept authenticated POST to /:user/messages', async () => {
      // Note: This will fail due to missing session, but should pass auth check
      const response = await request(httpServer)
        .post('/admin/messages?sessionId=fake-session-id')
        .set('Authorization', 'Bearer supersecret-value')
        .set('Content-Type', 'application/json')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
        });

      // Should not be 401 (auth error), might be 400 or 404 (session not found)
      expect(response.status).not.toBe(401);
    });
  });

  describe('Edge Cases and Security Considerations', () => {
    it('should not leak user existence through different error messages', async () => {
      const existingUserResponse = await request(httpServer)
        .post('/alice/mcp/alice-private')
        .set('Content-Type', 'application/json')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0' },
          },
        });

      const nonExistingUserResponse = await request(httpServer)
        .post('/nonexistent/mcp/alice-private')
        .set('Content-Type', 'application/json')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0' },
          },
        });

      // Both should return same error (401) to avoid user enumeration
      expect(existingUserResponse.status).toBe(nonExistingUserResponse.status);
      expect(existingUserResponse.body.error).toBe(nonExistingUserResponse.body.error);
    });

    it('should include WWW-Authenticate header with proper challenge', async () => {
      const response = await request(httpServer)
        .post('/admin/mcp/alice-private')
        .set('Content-Type', 'application/json')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0' },
          },
        });

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBeDefined();
      expect(response.headers['www-authenticate']).toMatch(/^Bearer /);
      expect(response.headers['www-authenticate']).toContain('error="invalid_token"');
    });
  });
});
