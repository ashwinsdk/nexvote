import express, { Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import db from '../db';
import logger from '../logger';
import { localizeField, normalizeLocale } from '../services/translation';

const router = express.Router();

// ── GET /api/users/search ──────────────────────────────────────────────────

router.get('/search', authMiddleware, async (req, res) => {
    try {
        const query = (req.query.q as string) || '';
        if (!query.trim()) {
            res.json({ users: [] });
            return;
        }

        const users = await db('users')
            .select('id', 'display_name', 'region_code', 'role')
            .whereILike('display_name', `%${query.trim()}%`)
            .orderBy('display_name', 'asc')
            .limit(20);

        res.json({ users });
    } catch (err) {
        logger.error({ err }, 'Failed to search users');
        res.status(500).json({ error: 'Failed to search users.' });
    }
});

/**
 * GET /api/users/:userId/profile
 * Get public user profile
 */
router.get('/:userId/profile', authMiddleware, async (req: Request, res: Response) => {
    try {
        const locale = normalizeLocale(req.locale);
        const { userId } = req.params;

        // Get user basic info
        const users = await db('users')
            .select('id', 'display_name', 'region_code', 'role', 'created_at')
            .where('id', userId)
            .limit(1);

        if (users.length === 0) {
            res.status(404).json({ error: 'User not found.' });
            return;
        }

        const user = users[0];

        // Get proposal count
        const proposalCount = await db('proposals')
            .where('created_by', userId)
            .count('* as count')
            .first();

        // Get vote count
        const voteCount = await db('votes')
            .where('user_id', userId)
            .count('* as count')
            .first();

        // Get community membership count
        const communityCount = await db('community_members')
            .where('user_id', userId)
            .count('* as count')
            .first();

        // Get recent proposals (limit 10)
        const proposals = await db('proposals as p')
            .select(
                'p.id',
                'p.title',
                'p.text',
                'p.category',
                'p.status',
                'p.summary',
                'p.yes_count',
                'p.no_count',
                'p.abstain_count',
                'p.created_at',
                'p.deadline',
                'c.name as community_name',
                'c.slug as community_slug'
            )
            .leftJoin('communities as c', 'p.community_id', 'c.id')
            .where('p.created_by', userId)
            .orderBy('p.created_at', 'desc')
            .limit(10);

        const localizedProposals = await Promise.all(
            proposals.map(async (proposal: any) => {
                const title = await localizeField({
                    english: proposal.title_en || proposal.title,
                    original: proposal.title,
                    originalLocale: proposal.title_lang,
                    targetLocale: locale,
                });
                const text = await localizeField({
                    english: proposal.text_en || proposal.text,
                    original: proposal.text,
                    originalLocale: proposal.text_lang,
                    targetLocale: locale,
                });
                const summary = await localizeField({
                    english: proposal.summary_en || proposal.summary,
                    original: proposal.summary,
                    originalLocale: proposal.summary_lang,
                    targetLocale: locale,
                });
                return {
                    ...proposal,
                    title,
                    text,
                    summary,
                };
            })
        );

        const profile = {
            id: user.id,
            displayName: user.display_name,
            regionCode: user.region_code,
            role: user.role,
            createdAt: user.created_at,
            proposalsCreated: Number(proposalCount?.count || 0),
            votesCast: Number(voteCount?.count || 0),
            communitiesJoined: Number(communityCount?.count || 0),
            proposals: localizedProposals,
        };

        res.json(profile);
    } catch (err) {
        logger.error({ err }, 'Failed to fetch user profile');
        res.status(500).json({ error: 'Failed to fetch user profile.' });
    }
});

export default router;
