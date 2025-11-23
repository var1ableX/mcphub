import { Request, Response, NextFunction } from 'express';
import { UserContextService } from '../services/userContextService.js';
import { IUser } from '../types/index.js';
import { resolveOAuthUserFromAuthHeader } from '../utils/oauthBearer.js';

/**
 * User context middleware
 * Sets user context after authentication middleware, allowing service layer to access current user information
 */
export const userContextMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const currentUser = (req as any).user as IUser;

    if (currentUser) {
      // Set user context
      const userContextService = UserContextService.getInstance();
      userContextService.setCurrentUser(currentUser);

      // Clean up user context when response ends
      res.on('finish', () => {
        const userContextService = UserContextService.getInstance();
        userContextService.clearCurrentUser();
      });
    }

    next();
  } catch (error) {
    console.error('Error in user context middleware:', error);
    next(error);
  }
};

/**
 * User context middleware for SSE/MCP endpoints
 * Extracts user from URL path parameter and sets user context
 * 
 * SECURITY: For user-scoped routes (/:user/...), this middleware validates
 * that the user is authenticated via JWT, OAuth, or Bearer token and that
 * the authenticated user matches the requested username in the URL.
 */
export const sseUserContextMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userContextService = UserContextService.getInstance();
    const username = req.params.user;
    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      userContextService.clearCurrentUser();
    };
    const attachCleanupHandlers = () => {
      res.on('finish', cleanup);
      res.on('close', cleanup);
    };

    if (username) {
      // SECURITY FIX: For user-scoped routes, authenticate the request
      // and validate that the authenticated user matches the requested username
      
      // Try to authenticate via Bearer token (OAuth or configured bearer key)
      const rawAuthHeader = Array.isArray(req.headers.authorization)
        ? req.headers.authorization[0]
        : req.headers.authorization;
      const bearerUser = resolveOAuthUserFromAuthHeader(rawAuthHeader);

      if (bearerUser) {
        // Authenticated via OAuth bearer token
        // Verify the authenticated user matches the requested username
        if (bearerUser.username !== username) {
          res.status(403).json({
            error: 'forbidden',
            error_description: `Authenticated user '${bearerUser.username}' cannot access resources for user '${username}'`,
          });
          return;
        }
        
        userContextService.setCurrentUser(bearerUser);
        attachCleanupHandlers();
        console.log(`OAuth user context set for SSE/MCP endpoint: ${bearerUser.username}`);
      } else {
        // SECURITY: No valid authentication provided for user-scoped route
        // User-scoped routes require authentication to prevent impersonation
        cleanup();
        res.status(401).json({
          error: 'unauthorized',
          error_description: 'Authentication required for user-scoped MCP endpoints. Please provide valid credentials via Authorization header.',
        });
        return;
      }
    } else {
      // Global route (no user in path)
      // Still check for OAuth bearer authentication if provided
      const rawAuthHeader = Array.isArray(req.headers.authorization)
        ? req.headers.authorization[0]
        : req.headers.authorization;
      const bearerUser = resolveOAuthUserFromAuthHeader(rawAuthHeader);

      if (bearerUser) {
        userContextService.setCurrentUser(bearerUser);
        attachCleanupHandlers();
        console.log(`OAuth user context set for SSE/MCP endpoint: ${bearerUser.username}`);
      } else {
        cleanup();
        console.log('Global SSE/MCP endpoint access - no user context');
      }
    }

    next();
  } catch (error) {
    console.error('Error in SSE user context middleware:', error);
    next(error);
  }
};

/**
 * Extended data service that can directly access current user context
 */
export interface ContextAwareDataService {
  getCurrentUserFromContext(): Promise<IUser | null>;
  getUserDataFromContext(dataType: string): Promise<any>;
  isCurrentUserAdmin(): Promise<boolean>;
}

export class ContextAwareDataServiceImpl implements ContextAwareDataService {
  private getUserContextService() {
    return UserContextService.getInstance();
  }

  async getCurrentUserFromContext(): Promise<IUser | null> {
    const userContextService = this.getUserContextService();
    return userContextService.getCurrentUser();
  }

  async getUserDataFromContext(dataType: string): Promise<any> {
    const userContextService = this.getUserContextService();
    const user = userContextService.getCurrentUser();

    if (!user) {
      throw new Error('No user in context');
    }

    console.log(`Getting ${dataType} data for user: ${user.username}`);

    // Return different data based on user permissions
    if (user.isAdmin) {
      return {
        type: dataType,
        data: 'Admin level data from context',
        user: user.username,
        access: 'full',
      };
    } else {
      return {
        type: dataType,
        data: 'User level data from context',
        user: user.username,
        access: 'limited',
      };
    }
  }

  async isCurrentUserAdmin(): Promise<boolean> {
    const userContextService = this.getUserContextService();
    return userContextService.isAdmin();
  }
}
