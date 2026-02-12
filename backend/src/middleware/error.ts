import { Request, Response, NextFunction } from 'express';
import logger from '../logger';

/**
 * Global error handler middleware.
 */
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
    const requestId = req.headers['x-request-id'] || 'unknown';
    logger.error({ err, requestId, path: req.path, method: req.method }, 'Unhandled error');

    res.status(500).json({
        error: 'Internal server error.',
        requestId,
    });
}
