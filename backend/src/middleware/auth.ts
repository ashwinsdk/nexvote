import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import logger from '../logger';

export interface AuthPayload {
    userId: string;
    email: string;
    role: string;
    regionCode: string;
}

declare global {
    namespace Express {
        interface Request {
            user?: AuthPayload;
        }
    }
}

/**
 * JWT authentication middleware.
 * Extracts token from Authorization header and verifies it.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing or invalid authorization header.' });
        return;
    }

    const token = header.slice(7);

    try {
        const payload = jwt.verify(token, config.jwtSecret) as AuthPayload;
        req.user = payload;
        next();
    } catch (err) {
        logger.warn({ err }, 'JWT verification failed');
        res.status(401).json({ error: 'Invalid or expired token.' });
    }
}

/**
 * Require a specific role (or higher).
 * Role hierarchy: user < moderator < admin < superadmin
 */
export function requireRole(...roles: string[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ error: 'Authentication required.' });
            return;
        }
        if (!roles.includes(req.user.role)) {
            res.status(403).json({ error: 'Insufficient permissions.' });
            return;
        }
        next();
    };
}
