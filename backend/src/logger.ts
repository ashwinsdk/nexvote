import pino from 'pino';
import { config } from './config';

const usePretty =
    config.nodeEnv === 'development' && process.stdout.isTTY && !process.env.VERCEL;

export const logger = pino({
    level: config.logLevel,
    transport: usePretty ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
});

export default logger;
