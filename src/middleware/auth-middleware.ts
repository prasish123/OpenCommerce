import { Request, Response, NextFunction } from 'express';
import { authService, UserRole } from '../services/auth/auth-service';
import { log } from '../shared/logger';

/**
 * Authentication Middleware
 * Verifies JWT token and attaches user to request
 */

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        username: string;
        role: UserRole;
        sessionId: string;
      };
    }
  }
}

/**
 * Require authentication
 */
export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.substring(7);

    // Verify token
    const result = await authService.verifyToken(token);
    if (!result.valid || !result.payload) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Attach user to request
    req.user = result.payload;

    next();
  } catch (error) {
    log.error('Authentication middleware error', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

/**
 * Require specific role
 */
export const requireRole = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

/**
 * Require specific permission
 */
export const requirePermission = (permission: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check role-based permission
    const hasPermission = authService.hasRolePermission(req.user.role, permission);
    if (!hasPermission) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

/**
 * Optional authentication (attach user if token present, but don't require it)
 */
export const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const result = await authService.verifyToken(token);
      if (result.valid && result.payload) {
        req.user = result.payload;
      }
    }
    next();
  } catch (error) {
    // Ignore errors for optional auth
    next();
  }
};
