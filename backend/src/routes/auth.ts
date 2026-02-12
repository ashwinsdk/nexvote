import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z } from 'zod';
import db from '../db';
import { config } from '../config';
import logger from '../logger';
import { authMiddleware } from '../middleware/auth';
import { emailService } from '../services/email';

const router = Router();

// ── Validation schemas ──────────────────────────────────────────────────────

const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8).max(128),
    displayName: z.string().min(2).max(100),
    regionCode: z.string().min(2).max(20),
    mobileHash: z.string().optional(),
});

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
});

const verifyOtpSchema = z.object({
    email: z.string().email(),
    otp: z.string().length(6),
});

async function sendOtpEmail(email: string, displayName: string): Promise<void> {
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + config.otpExpirySeconds * 1000);

    await db('otp_tokens').insert({
        identifier: email,
        otp_hash: otpHash,
        type: 'email',
        expires_at: expiresAt,
    });

    if (config.nodeEnv === 'development') {
        logger.info({ otp, email }, 'OTP generated (dev only)');
    }

    try {
        await emailService.sendVerificationCode(email, otp, displayName);
    } catch (emailErr) {
        logger.warn({ emailErr, email }, 'Failed to send verification email');
    }
}

// ── POST /api/auth/register ─────────────────────────────────────────────────

router.post('/register', async (req: Request, res: Response) => {
    try {
        const body = registerSchema.parse(req.body);

        // Check for existing user
        const existing = await db('users').where({ email: body.email }).first();
        if (existing) {
            if (!existing.signup_verified) {
                await sendOtpEmail(existing.email, existing.display_name || 'there');
                res.status(200).json({
                    message: 'Email already registered. OTP resent for verification.',
                    user: {
                        id: existing.id,
                        email: existing.email,
                        displayName: existing.display_name,
                        regionCode: existing.region_code,
                        role: existing.role,
                        signupVerified: existing.signup_verified,
                    },
                });
                return;
            }

            res.status(409).json({ error: 'Email already registered.' });
            return;
        }

        const passwordHash = await bcrypt.hash(body.password, 12);

        const [user] = await db('users')
            .insert({
                email: body.email,
                password_hash: passwordHash,
                display_name: body.displayName,
                region_code: body.regionCode,
                mobile_hash: body.mobileHash || null,
                signup_verified: false,
                role: 'user',
            })
            .returning(['id', 'email', 'display_name', 'region_code', 'role', 'signup_verified', 'created_at']);

        await sendOtpEmail(body.email, body.displayName);

        // Create verification record (simulated / prototype only)
        await db('verifications').insert({
            user_id: user.id,
            method: 'email_otp',
            status: 'pending',
            notes: 'Simulated / prototype only -- email OTP verification pending.',
        });

        res.status(201).json({
            message: 'Registration successful. Verify your email with the OTP sent.',
            user: {
                id: user.id,
                email: user.email,
                displayName: user.display_name,
                regionCode: user.region_code,
                role: user.role,
                signupVerified: user.signup_verified,
            },
        });
    } catch (err) {
        if (err instanceof z.ZodError) {
            res.status(400).json({ error: 'Validation failed.', details: err.errors });
            return;
        }
        logger.error({ err }, 'Registration failed');
        res.status(500).json({ error: 'Registration failed.' });
    }
});

// ── POST /api/auth/verify-otp ───────────────────────────────────────────────

router.post('/verify-otp', async (req: Request, res: Response) => {
    try {
        const body = verifyOtpSchema.parse(req.body);

        const otpRecord = await db('otp_tokens')
            .where({ identifier: body.email, type: 'email', used: false })
            .where('expires_at', '>', new Date())
            .orderBy('created_at', 'desc')
            .first();

        if (!otpRecord) {
            res.status(400).json({ error: 'No valid OTP found. Request a new one.' });
            return;
        }

        const valid = await bcrypt.compare(body.otp, otpRecord.otp_hash);
        if (!valid) {
            res.status(400).json({ error: 'Invalid OTP.' });
            return;
        }

        // Mark OTP as used
        await db('otp_tokens').where({ id: otpRecord.id }).update({ used: true });

        // Mark user as verified
        const [user] = await db('users')
            .where({ email: body.email })
            .update({ signup_verified: true, updated_at: new Date() })
            .returning(['id', 'email', 'display_name', 'region_code', 'role']);

        // Update verification record
        await db('verifications')
            .where({ user_id: user.id, method: 'email_otp', status: 'pending' })
            .update({
                status: 'verified',
                proof_hash: crypto.createHash('sha256').update(`${body.email}:${body.otp}:verified`).digest('hex'),
                verified_at: new Date(),
                notes: 'Simulated / prototype only -- email OTP verified.',
            });

        // Issue JWT
        const token = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                role: user.role,
                regionCode: user.region_code,
            } as { userId: string; email: string; role: string; regionCode: string },
            config.jwtSecret,
            { expiresIn: config.jwtExpiresIn } as jwt.SignOptions
        );

        // Audit log
        await db('audit_log').insert({
            event_type: 'user_verified',
            reference_id: user.id,
            reference_table: 'users',
            actor_id: user.id,
            details: { method: 'email_otp' },
        });

        res.json({
            message: 'Email verified successfully.',
            token,
            user: {
                id: user.id,
                email: user.email,
                displayName: user.display_name,
                regionCode: user.region_code,
                role: user.role,
            },
        });
    } catch (err) {
        if (err instanceof z.ZodError) {
            res.status(400).json({ error: 'Validation failed.', details: err.errors });
            return;
        }
        logger.error({ err }, 'OTP verification failed');
        res.status(500).json({ error: 'Verification failed.' });
    }
});

// ── POST /api/auth/login ────────────────────────────────────────────────────

router.post('/login', async (req: Request, res: Response) => {
    try {
        const body = loginSchema.parse(req.body);

        const user = await db('users').where({ email: body.email }).first();
        if (!user) {
            res.status(401).json({ error: 'Invalid email or password.' });
            return;
        }

        const valid = await bcrypt.compare(body.password, user.password_hash);
        if (!valid) {
            res.status(401).json({ error: 'Invalid email or password.' });
            return;
        }

        if (!user.signup_verified) {
            await sendOtpEmail(user.email, user.display_name || 'there');
            res.status(403).json({ error: 'Email not verified. OTP resent for verification.' });
            return;
        }

        const token = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                role: user.role,
                regionCode: user.region_code,
            } as { userId: string; email: string; role: string; regionCode: string },
            config.jwtSecret,
            { expiresIn: config.jwtExpiresIn } as jwt.SignOptions
        );

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                displayName: user.display_name,
                regionCode: user.region_code,
                role: user.role,
                signupVerified: user.signup_verified,
            },
        });
    } catch (err) {
        if (err instanceof z.ZodError) {
            res.status(400).json({ error: 'Validation failed.', details: err.errors });
            return;
        }
        logger.error({ err }, 'Login failed');
        res.status(500).json({ error: 'Login failed.' });
    }
});

// ── GET /api/auth/me ────────────────────────────────────────────────────────

router.get('/me', authMiddleware, async (req: Request, res: Response) => {
    try {
        const user = await db('users')
            .where({ id: req.user!.userId })
            .select('id', 'email', 'display_name', 'region_code', 'role', 'signup_verified', 'created_at')
            .first();

        if (!user) {
            res.status(404).json({ error: 'User not found.' });
            return;
        }

        res.json({
            id: user.id,
            email: user.email,
            displayName: user.display_name,
            regionCode: user.region_code,
            role: user.role,
            signupVerified: user.signup_verified,
            createdAt: user.created_at,
        });
    } catch (err) {
        logger.error({ err }, 'Failed to fetch user profile');
        res.status(500).json({ error: 'Failed to fetch profile.' });
    }
});

export default router;
