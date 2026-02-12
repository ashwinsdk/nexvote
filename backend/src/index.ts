import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import logger from './logger';
import { errorHandler } from './middleware/error';
import authRoutes from './routes/auth';
import communityRoutes from './routes/communities';
import proposalRoutes from './routes/proposals';
import adminRoutes from './routes/admin';
import userRoutes from './routes/users';
import { aiService } from './services/ai';
import { relayerService } from './services/relayer';
import { localeMiddleware } from './middleware/locale';

const app = express();

// ── Global middleware ────────────────────────────────────────────────────────

app.use(helmet());
app.use(
    cors({
        origin: config.corsOrigin,
        credentials: true,
    })
);
app.use(express.json({ limit: '1mb' }));
app.use(localeMiddleware);

// Global rate limiter
app.use(
    rateLimit({
        windowMs: config.rateLimitWindowMs,
        max: config.rateLimitMaxRequests,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Too many requests. Please try again later.' },
    })
);

// Request ID
app.use((req, _res, next) => {
    req.headers['x-request-id'] = req.headers['x-request-id'] || crypto.randomUUID();
    next();
});

// ── Routes ───────────────────────────────────────────────────────────────────

app.use('/api/auth', authRoutes);
app.use('/api/communities', communityRoutes);
app.use('/api/proposals', proposalRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes);

// ── Health check ─────────────────────────────────────────────────────────────

app.get('/health', async (_req, res) => {
    const aiHealthy = await aiService.healthCheck();
    const relayerBalance = await relayerService.getBalance();

    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        services: {
            ai: aiHealthy ? 'healthy' : 'unavailable',
            relayer: {
                status: relayerBalance !== '0' ? 'funded' : 'unfunded',
                balance: relayerBalance,
            },
        },
    });
});

// ── Error handling ───────────────────────────────────────────────────────────

app.use(errorHandler);

// ── Start server ─────────────────────────────────────────────────────────────

if (require.main === module) {
    app.listen(config.port, () => {
        logger.info({ port: config.port, env: config.nodeEnv }, 'NexVote backend started');
    });
}

export default app;
