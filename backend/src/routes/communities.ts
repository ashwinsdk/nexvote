import { Router, Request, Response } from 'express';
import { z } from 'zod';
import db from '../db';
import logger from '../logger';
import { authMiddleware, requireRole } from '../middleware/auth';
import {
    detectLocale,
    localizeField,
    normalizeLocale,
    translateText,
} from '../services/translation';

const router = Router();

const normalizeRegionCode = (value?: string): string =>
    (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// ── Validation ──────────────────────────────────────────────────────────────

const createCommunitySchema = z.object({
    slug: z.string().min(3).max(50).regex(/^[a-z0-9-]+$/),
    name: z.string().min(3).max(200),
    description: z.string().max(2000).optional(),
    regionCode: z.string().min(2).max(20),
    category: z.string().min(2).max(50),
});

// ── GET /api/communities ────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
    try {
        const locale = normalizeLocale(req.locale);
        const { region, category, page = '1', limit = '20', search } = req.query;
        const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);

        let query = db('communities')
            .select(
                'communities.*',
                db.raw('(SELECT COUNT(*) FROM community_members WHERE community_members.community_id = communities.id) as member_count'),
                db.raw('(SELECT COUNT(*) FROM proposals WHERE proposals.community_id = communities.id) as proposal_count')
            );

        if (region) query = query.where('region_code', region as string);
        if (category) query = query.where('category', category as string);
        if (search) {
            query = query.where(function () {
                this.whereILike('name', `%${search}%`).orWhereILike('slug', `%${search}%`);
            });
        }

        const communities = await query
            .orderBy('created_at', 'desc')
            .limit(parseInt(limit as string, 10))
            .offset(offset);

        const localized = await Promise.all(
            communities.map(async (community: any) => {
                const name = await localizeField({
                    english: community.name_en || community.name,
                    original: community.name,
                    originalLocale: community.name_lang,
                    targetLocale: locale,
                });
                const description = await localizeField({
                    english: community.description_en || community.description,
                    original: community.description,
                    originalLocale: community.description_lang,
                    targetLocale: locale,
                });
                return {
                    ...community,
                    name,
                    description,
                };
            })
        );

        const [{ count }] = await db('communities').count('* as count');

        res.json({
            communities: localized,
            pagination: {
                page: parseInt(page as string, 10),
                limit: parseInt(limit as string, 10),
                total: parseInt(count as string, 10),
            },
        });
    } catch (err) {
        logger.error({ err }, 'Failed to fetch communities');
        res.status(500).json({ error: 'Failed to fetch communities.' });
    }
});

// ── GET /api/communities/:slug ──────────────────────────────────────────────

router.get('/:slug', async (req: Request, res: Response) => {
    try {
        const locale = normalizeLocale(req.locale);
        const community = await db('communities')
            .where({ slug: req.params.slug })
            .select(
                'communities.*',
                db.raw('(SELECT COUNT(*) FROM community_members WHERE community_members.community_id = communities.id) as member_count'),
                db.raw('(SELECT COUNT(*) FROM proposals WHERE proposals.community_id = communities.id) as proposal_count')
            )
            .first();

        if (!community) {
            res.status(404).json({ error: 'Community not found.' });
            return;
        }

        res.json({
            ...community,
            name: await localizeField({
                english: community.name_en || community.name,
                original: community.name,
                originalLocale: community.name_lang,
                targetLocale: locale,
            }),
            description: await localizeField({
                english: community.description_en || community.description,
                original: community.description,
                originalLocale: community.description_lang,
                targetLocale: locale,
            }),
        });
    } catch (err) {
        logger.error({ err }, 'Failed to fetch community');
        res.status(500).json({ error: 'Failed to fetch community.' });
    }
});

// ── GET /api/communities/:slug/membership ───────────────────────────────────

router.get('/:slug/membership', authMiddleware, async (req: Request, res: Response) => {
    try {
        const community = await db('communities').where({ slug: req.params.slug }).first();
        if (!community) {
            res.status(404).json({ error: 'Community not found.' });
            return;
        }

        const isMember = await db('community_members')
            .where({ community_id: community.id, user_id: req.user!.userId })
            .first();

        const regionMatch =
            normalizeRegionCode(community.region_code) === normalizeRegionCode(req.user!.regionCode);

        const locale = normalizeLocale(req.locale);
        const reasonEn = regionMatch
            ? (isMember ? 'You are already a member.' : 'You can join this community.')
            : `Your account region (${req.user!.regionCode}) does not match this community (${community.region_code}).`;
        const reason = await localizeField({
            english: reasonEn,
            targetLocale: locale,
        });

        res.json({
            isMember: !!isMember,
            canJoin: regionMatch,
            reason,
        });
    } catch (err) {
        logger.error({ err }, 'Failed to fetch community membership');
        res.status(500).json({ error: 'Failed to fetch membership.' });
    }
});

// ── POST /api/communities ───────────────────────────────────────────────────

router.post('/', authMiddleware, async (req: Request, res: Response) => {
    try {
        const body = createCommunitySchema.parse(req.body);

        const nameLang = await detectLocale(body.name);
        const descriptionLang = body.description ? await detectLocale(body.description) : 'en';
        const nameEn = nameLang === 'en' ? body.name : await translateText(body.name, nameLang, 'en');
        const descriptionEn = body.description
            ? (descriptionLang === 'en'
                ? body.description
                : await translateText(body.description, descriptionLang, 'en'))
            : null;

        // Check for duplicate slug
        const existingSlug = await db('communities').where({ slug: body.slug }).first();
        if (existingSlug) {
            res.status(409).json({ error: 'Community slug already in use.' });
            return;
        }

        // Check for semantic duplicate via AI (name + description similarity)
        // STUB: TODO -- integrate with AI service /embed endpoint for semantic dedupe
        // For now, do a basic name similarity check
        const similarNames = await db('communities')
            .where('region_code', body.regionCode)
            .whereILike('name', `%${body.name.split(' ').slice(0, 2).join('%')}%`)
            .limit(5);

        if (similarNames.length > 0) {
            res.status(409).json({
                error: 'Similar communities already exist in this region.',
                similarCommunities: similarNames.map((c: any) => ({ slug: c.slug, name: c.name })),
            });
            return;
        }

        const [community] = await db('communities')
            .insert({
                slug: body.slug,
                name: body.name,
                description: body.description || null,
                owner_user_id: req.user!.userId,
                region_code: body.regionCode,
                category: body.category,
                verified: false,
                name_en: nameEn,
                name_lang: nameLang,
                description_en: descriptionEn,
                description_lang: descriptionLang,
            })
            .returning('*');

        // Auto-add creator as owner member
        await db('community_members').insert({
            community_id: community.id,
            user_id: req.user!.userId,
            role: 'owner',
        });

        // Audit log
        await db('audit_log').insert({
            event_type: 'community_created',
            reference_id: community.id,
            reference_table: 'communities',
            actor_id: req.user!.userId,
            details: { slug: community.slug, name: community.name },
        });

        res.status(201).json({
            ...community,
            name: await localizeField({
                english: community.name_en || community.name,
                original: community.name,
                originalLocale: community.name_lang,
                targetLocale: normalizeLocale(req.locale),
            }),
            description: await localizeField({
                english: community.description_en || community.description,
                original: community.description,
                originalLocale: community.description_lang,
                targetLocale: normalizeLocale(req.locale),
            }),
        });
    } catch (err) {
        if (err instanceof z.ZodError) {
            res.status(400).json({ error: 'Validation failed.', details: err.errors });
            return;
        }
        logger.error({ err }, 'Failed to create community');
        res.status(500).json({ error: 'Failed to create community.' });
    }
});

// ── POST /api/communities/:slug/join ────────────────────────────────────────

router.post('/:slug/join', authMiddleware, async (req: Request, res: Response) => {
    try {
        const community = await db('communities').where({ slug: req.params.slug }).first();
        if (!community) {
            res.status(404).json({ error: 'Community not found.' });
            return;
        }

        // Check region match
        const regionMatch =
            normalizeRegionCode(community.region_code) === normalizeRegionCode(req.user!.regionCode);
        if (!regionMatch) {
            res.status(403).json({
                error: `Your account region (${req.user!.regionCode}) does not match this community (${community.region_code}).`,
            });
            return;
        }

        // Check if already a member
        const existing = await db('community_members')
            .where({ community_id: community.id, user_id: req.user!.userId })
            .first();
        if (existing) {
            res.status(409).json({ error: 'Already a member of this community.' });
            return;
        }

        await db('community_members').insert({
            community_id: community.id,
            user_id: req.user!.userId,
            role: 'member',
        });

        const message = await localizeField({
            english: 'Joined community successfully.',
            targetLocale: normalizeLocale(req.locale),
        });
        res.json({ message });
    } catch (err) {
        logger.error({ err }, 'Failed to join community');
        res.status(500).json({ error: 'Failed to join community.' });
    }
});

// ── POST /api/communities/:slug/leave ───────────────────────────────────────

router.post('/:slug/leave', authMiddleware, async (req: Request, res: Response) => {
    try {
        const community = await db('communities').where({ slug: req.params.slug }).first();
        if (!community) {
            res.status(404).json({ error: 'Community not found.' });
            return;
        }

        const membership = await db('community_members')
            .where({ community_id: community.id, user_id: req.user!.userId })
            .first();

        if (!membership) {
            res.status(404).json({ error: 'Not a member of this community.' });
            return;
        }

        if (membership.role === 'owner') {
            res.status(403).json({ error: 'Owners cannot leave. Transfer ownership first.' });
            return;
        }

        await db('community_members')
            .where({ community_id: community.id, user_id: req.user!.userId })
            .del();

        const message = await localizeField({
            english: 'Left community successfully.',
            targetLocale: normalizeLocale(req.locale),
        });
        res.json({ message });
    } catch (err) {
        logger.error({ err }, 'Failed to leave community');
        res.status(500).json({ error: 'Failed to leave community.' });
    }
});

export default router;
