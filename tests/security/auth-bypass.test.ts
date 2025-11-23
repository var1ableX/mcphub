/**
 * Security Test: Authentication Bypass Vulnerability
 * 
 * This test file validates that the authentication bypass vulnerability
 * described in the security report has been fixed.
 * 
 * Vulnerability Details:
 * - User-scoped MCP endpoints (/:user/mcp/*) accepted requests without authentication
 * - Bearer auth validation was bypassed due to filtered settings
 * - Users could impersonate other users by changing username in URL
 */

import { Request, Response } from 'express';
import { sseUserContextMiddleware } from '../../src/middlewares/userContext';
import { resolveOAuthUserFromAuthHeader } from '../../src/utils/oauthBearer';

// Mock dependencies
jest.mock('../../src/utils/oauthBearer');
jest.mock('../../src/services/userContextService', () => ({
  UserContextService: {
    getInstance: jest.fn(() => ({
      setCurrentUser: jest.fn(),
      clearCurrentUser: jest.fn(),
      getCurrentUser: jest.fn(),
    })),
  },
}));

describe('Authentication Bypass Security Tests', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock;
  let mockResolveOAuthUser: jest.MockedFunction<typeof resolveOAuthUserFromAuthHeader>;

  beforeEach(() => {
    mockResolveOAuthUser = resolveOAuthUserFromAuthHeader as jest.MockedFunction<
      typeof resolveOAuthUserFromAuthHeader
    >;
    mockNext = jest.fn();
    
    // Mock response methods
    const statusMock = jest.fn().mockReturnThis();
    const jsonMock = jest.fn();
    const onMock = jest.fn();
    
    mockRes = {
      status: statusMock,
      json: jsonMock,
      on: onMock,
    };
    
    mockReq = {
      params: {},
      headers: {},
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('User-scoped route authentication', () => {
    it('should reject unauthenticated requests to user-scoped routes', async () => {
      // Setup: No authentication provided
      mockReq.params = { user: 'admin' };
      mockResolveOAuthUser.mockReturnValue(null);

      // Execute
      await sseUserContextMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      // Verify: Should return 401 Unauthorized
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'unauthorized',
        error_description: expect.stringContaining('Authentication required'),
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject requests when authenticated user does not match URL username', async () => {
      // Setup: User alice tries to access bob's resources
      mockReq.params = { user: 'bob' };
      mockReq.headers = { authorization: 'Bearer alice-token' };
      
      mockResolveOAuthUser.mockReturnValue({
        username: 'alice',
        password: '',
        isAdmin: false,
      });

      // Execute
      await sseUserContextMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      // Verify: Should return 403 Forbidden
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'forbidden',
        error_description: expect.stringContaining("cannot access resources for user 'bob'"),
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should allow authenticated user to access their own resources', async () => {
      // Setup: User alice accesses her own resources
      mockReq.params = { user: 'alice' };
      mockReq.headers = { authorization: 'Bearer alice-token' };
      
      mockResolveOAuthUser.mockReturnValue({
        username: 'alice',
        password: '',
        isAdmin: false,
      });

      // Execute
      await sseUserContextMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      // Verify: Should proceed to next middleware
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow admin user with matching username', async () => {
      // Setup: Admin user accesses their resources
      mockReq.params = { user: 'admin' };
      mockReq.headers = { authorization: 'Bearer admin-token' };
      
      mockResolveOAuthUser.mockReturnValue({
        username: 'admin',
        password: '',
        isAdmin: true,
      });

      // Execute
      await sseUserContextMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      // Verify: Should proceed to next middleware
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Global route authentication', () => {
    it('should allow global routes without user parameter', async () => {
      // Setup: No user in URL path
      mockReq.params = {};
      mockResolveOAuthUser.mockReturnValue(null);

      // Execute
      await sseUserContextMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      // Verify: Should proceed (authentication optional for global routes)
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should set user context for global routes with valid OAuth token', async () => {
      // Setup: Global route with OAuth token
      mockReq.params = {};
      mockReq.headers = { authorization: 'Bearer valid-token' };
      
      mockResolveOAuthUser.mockReturnValue({
        username: 'alice',
        password: '',
        isAdmin: false,
      });

      // Execute
      await sseUserContextMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      // Verify: Should set user context and proceed
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Impersonation attack prevention', () => {
    it('should prevent impersonation by URL manipulation', async () => {
      // Scenario from vulnerability report:
      // Attacker tries to access /admin/mcp/alice-private without credentials
      mockReq.params = { user: 'admin', group: 'alice-private' };
      mockResolveOAuthUser.mockReturnValue(null);

      // Execute
      await sseUserContextMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      // Verify: Should be rejected
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should prevent impersonation even with valid token for different user', async () => {
      // Scenario: User bob tries to access admin's resources using his own valid token
      mockReq.params = { user: 'admin', group: 'admin-secret' };
      mockReq.headers = { authorization: 'Bearer bob-token' };
      
      mockResolveOAuthUser.mockReturnValue({
        username: 'bob',
        password: '',
        isAdmin: false,
      });

      // Execute
      await sseUserContextMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      // Verify: Should be rejected with 403
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'forbidden',
        error_description: expect.stringContaining("'bob' cannot access resources for user 'admin'"),
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
