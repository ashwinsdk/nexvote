import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const normalizeOrigin = (origin: string): string => origin.trim().replace(/\/$/, '');

const parseCorsOrigins = (value?: string): string | string[] => {
    const raw = (value || 'http://localhost:4200').trim();
    if (!raw.includes(',')) {
        return normalizeOrigin(raw);
    }

    const origins = raw
        .split(',')
        .map((entry) => normalizeOrigin(entry))
        .filter(Boolean);

    return origins.length > 0 ? origins : 'http://localhost:4200';
};

export const config = {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    corsOrigin: parseCorsOrigins(process.env.CORS_ORIGIN),

    // Database
    databaseUrl: process.env.DATABASE_URL || 'postgresql://nexvote:nexvote@localhost:5432/nexvote',
    dbPoolMin: parseInt(process.env.DATABASE_POOL_MIN || '2', 10),
    dbPoolMax: parseInt(process.env.DATABASE_POOL_MAX || '10', 10),

    // Auth
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    otpExpirySeconds: parseInt(process.env.OTP_EXPIRY_SECONDS || '300', 10),

    // Blockchain
    sepoliaRpcUrl: process.env.SEPOLIA_RPC_URL || '',
    relayerPrivateKey: process.env.RELAYER_PRIVATE_KEY || '',
    registryAddress: process.env.NEXVOTE_REGISTRY_ADDRESS || '',
    chainId: parseInt(process.env.CHAIN_ID || '11155111', 10),

    // AI Service
    aiServiceUrl: process.env.AI_SERVICE_URL || 'http://localhost:8000',
    aiApiKey: process.env.AI_API_KEY || '',
    similarityThreshold: parseFloat(process.env.SIMILARITY_THRESHOLD || '0.85'),
    embeddingDimension: parseInt(process.env.EMBEDDING_DIMENSION || '384', 10),

    // IPFS
    pinataApiKey: process.env.IPFS_PINATA_API_KEY || '',
    pinataSecret: process.env.IPFS_PINATA_SECRET || '',
    ipfsGatewayUrl: process.env.IPFS_GATEWAY_URL || 'https://gateway.pinata.cloud/ipfs',

    // Security
    captchaSecret: process.env.CAPTCHA_SECRET || '',
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    proposalRateLimitMax: parseInt(process.env.PROPOSAL_RATE_LIMIT_MAX || '5', 10),
    relayerRateLimitMax: parseInt(process.env.RELAYER_RATE_LIMIT_MAX || '50', 10),

    // Logging
    logLevel: process.env.LOG_LEVEL || 'info',
};
