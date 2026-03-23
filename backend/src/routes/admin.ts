import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import db from '../db';
import logger from '../logger';
import { authMiddleware, requireRole } from '../middleware/auth';
import { relayerService } from '../services/relayer';
import { localizeField, normalizeLocale } from '../services/translation';
import { finalizeExpiredProposals, finalizeForAdmin } from '../services/votingLifecycle';
import { notificationService } from '../services/notifications';

const router = Router();

const normalizeRegionCode = (value?: string): string =>
    (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const regionVariants = (value?: string): string[] => {
    const raw = (value || '').trim();
    const normalized = normalizeRegionCode(raw);
    if (!normalized) {
        return [];
    }

    const variants = new Set<string>([normalized]);
    const segments = raw
        .split(/[-_\s]+/g)
        .map((part) => part.trim())
        .filter(Boolean);

    if (segments.length >= 2) {
        variants.add(normalizeRegionCode(segments.slice(-2).join('')));
    }
    if (segments.length >= 3) {
        variants.add(normalizeRegionCode(segments.slice(-3).join('')));
    }

    return Array.from(variants).filter(Boolean);
};

const applyNormalizedRegionFilter = (
    query: any,
    column: string,
    variants: string[]
) => {
    if (!variants.length) {
        return query;
    }

    query.where((qb: any) => {
        for (let i = 0; i < variants.length; i += 1) {
            const variant = variants[i];
            if (i === 0) {
                qb.whereRaw(
                    `regexp_replace(LOWER(${column}), '[^a-z0-9]', '', 'g') = ?`,
                    [variant]
                );
            } else {
                qb.orWhereRaw(
                    `regexp_replace(LOWER(${column}), '[^a-z0-9]', '', 'g') = ?`,
                    [variant]
                );
            }
        }
    });

    return query;
};

// ── Validation ──────────────────────────────────────────────────────────────

const updateStatusSchema = z.object({
    proposalId: z.string().uuid(),
    status: z.enum(['implemented', 'archived']),
    description: z.string().max(2000).optional(),
});

// ── GET /api/admin/dashboard ────────────────────────────────────────────────

router.get(
    '/dashboard',
    authMiddleware,
    requireRole('admin', 'superadmin'),
    async (req: Request, res: Response) => {
        try {
            await finalizeExpiredProposals();

            const locale = normalizeLocale(req.locale);
            const userRecord = await db('users')
                .select('region_code')
                .where({ id: req.user!.userId })
                .first();
            const regionCode = userRecord?.region_code || req.user!.regionCode || '';
            const regionCodeOptions = regionVariants(regionCode);

            // Active proposals in the admin's region
            const activeQuery = db('proposals');
            applyNormalizedRegionFilter(activeQuery, 'region_code', regionCodeOptions);
            const activeProposals = await activeQuery
                .whereIn('status', ['voting', 'active'])
                .orderBy('created_at', 'desc')
                .limit(50);

            // Finalized proposals
            const finalizedQuery = db('proposals');
            applyNormalizedRegionFilter(finalizedQuery, 'region_code', regionCodeOptions);
            const finalizedProposals = await finalizedQuery
                .whereIn('status', ['passed', 'failed', 'implemented', 'archived'])
                .orderBy('finalized_at', 'desc')
                .limit(50);

            // Communities in region
            const communitiesQuery = db('communities').select('*');
            applyNormalizedRegionFilter(communitiesQuery, 'region_code', regionCodeOptions);
            const communities = await communitiesQuery;

            const localizedActive = await Promise.all(
                activeProposals.map(async (proposal: any) => ({
                    ...proposal,
                    title: await localizeField({
                        english: proposal.title_en || proposal.title,
                        original: proposal.title,
                        originalLocale: proposal.title_lang,
                        targetLocale: locale,
                    }),
                    summary: await localizeField({
                        english: proposal.summary_en || proposal.summary,
                        original: proposal.summary,
                        originalLocale: proposal.summary_lang,
                        targetLocale: locale,
                    }),
                }))
            );

            const localizedFinalized = await Promise.all(
                finalizedProposals.map(async (proposal: any) => ({
                    ...proposal,
                    title: await localizeField({
                        english: proposal.title_en || proposal.title,
                        original: proposal.title,
                        originalLocale: proposal.title_lang,
                        targetLocale: locale,
                    }),
                    summary: await localizeField({
                        english: proposal.summary_en || proposal.summary,
                        original: proposal.summary,
                        originalLocale: proposal.summary_lang,
                        targetLocale: locale,
                    }),
                }))
            );

            const localizedCommunities = await Promise.all(
                communities.map(async (community: any) => ({
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
                }))
            );

            // Recent admin actions
            const recentActionsQuery = db('admin_actions as aa')
                .leftJoin('proposals as p', 'aa.proposal_id', 'p.id')
                .leftJoin('communities as c', 'aa.community_id', 'c.id')
                .leftJoin('users as u', 'aa.admin_id', 'u.id')
                .select(
                    'aa.*',
                    'u.display_name as admin_name',
                    'p.title as proposal_title',
                    'c.name as community_name'
                )
                .where(function () {
                    this.where('aa.admin_id', req.user!.userId);
                    for (const variant of regionCodeOptions) {
                        this.orWhereRaw(
                            "regexp_replace(LOWER(COALESCE(p.region_code, c.region_code, '')), '[^a-z0-9]', '', 'g') = ?",
                            [variant]
                        );
                    }
                })
                .orderBy('created_at', 'desc')
                .limit(20);
            const recentActions = await recentActionsQuery;

            // Donation totals
            const donationsQuery = db('donations')
                .join('proposals', 'donations.proposal_id', 'proposals.id');
            applyNormalizedRegionFilter(donationsQuery, 'proposals.region_code', regionCodeOptions);
            const [donationStats] = await donationsQuery
                .where('donations.status', 'completed')
                .select(
                    db.raw('COALESCE(SUM(donations.amount), 0) as total_donations'),
                    db.raw('COUNT(donations.id) as donation_count')
                );

            // Civic score (simplified: based on admin action count and proposal finalization rate)
            const [actionCount] = await db('admin_actions')
                .where({ admin_id: req.user!.userId })
                .count('* as count');

            const civicScore = Math.min(
                100,
                Math.round(
                    (parseInt(actionCount.count as string, 10) * 5 +
                        finalizedProposals.length * 10) /
                    Math.max(1, activeProposals.length + finalizedProposals.length) *
                    10
                )
            );

            res.json({
                regionCode: regionCode || req.user!.regionCode || null,
                activeProposals: localizedActive,
                finalizedProposals: localizedFinalized,
                communities: localizedCommunities,
                recentActions,
                donationStats: {
                    totalDonations: donationStats.total_donations,
                    donationCount: donationStats.donation_count,
                },
                civicScore,
            });
        } catch (err) {
            logger.error({ err }, 'Failed to fetch admin dashboard');
            res.status(500).json({ error: 'Failed to fetch dashboard.' });
        }
    }
);

// ── POST /api/admin/finalize ────────────────────────────────────────────────

router.post(
    '/finalize',
    authMiddleware,
    requireRole('admin', 'superadmin'),
    async (req: Request, res: Response) => {
        try {
            const { proposalId } = req.body;

            const proposal = await db('proposals').where({ id: proposalId }).first();
            if (!proposal) {
                res.status(404).json({ error: 'Proposal not found.' });
                return;
            }

            const regionMatch =
                normalizeRegionCode(proposal.region_code) === normalizeRegionCode(req.user!.regionCode);
            if (!regionMatch) {
                res.status(403).json({ error: 'You cannot finalize proposals outside your region.' });
                return;
            }

            if (proposal.status !== 'voting' && proposal.status !== 'active') {
                res.status(400).json({ error: 'Proposal is not in voting status.' });
                return;
            }

            const finalized = await finalizeForAdmin(proposal, req.user!.userId);

            res.json({
                message: `Proposal ${finalized.status}.`,
                proposalId,
                status: finalized.status,
                resultHash: finalized.resultHash,
                txHash: finalized.txHash,
                counts: {
                    yes: proposal.yes_count,
                    no: proposal.no_count,
                    abstain: proposal.abstain_count,
                },
            });
        } catch (err) {
            logger.error({ err }, 'Failed to finalize proposal');
            res.status(500).json({ error: 'Failed to finalize proposal.' });
        }
    }
);

// ── POST /api/admin/update-status ───────────────────────────────────────────

router.post(
    '/update-status',
    authMiddleware,
    requireRole('admin', 'superadmin'),
    async (req: Request, res: Response) => {
        try {
            const body = updateStatusSchema.parse(req.body);

            const proposal = await db('proposals').where({ id: body.proposalId }).first();
            if (!proposal) {
                res.status(404).json({ error: 'Proposal not found.' });
                return;
            }

            const regionMatch =
                normalizeRegionCode(proposal.region_code) === normalizeRegionCode(req.user!.regionCode);
            if (!regionMatch) {
                res.status(403).json({ error: 'Region mismatch.' });
                return;
            }

            const statusData = JSON.stringify({
                proposalId: body.proposalId,
                status: body.status,
                description: body.description,
                updatedBy: req.user!.userId,
                updatedAt: new Date().toISOString(),
            });
            const statusHash = '0x' + crypto.createHash('sha256').update(statusData).digest('hex');

            const updatePayload: Record<string, any> = {
                status: body.status,
                updated_at: new Date(),
            };
            if (body.status === 'archived') {
                updatePayload.archived_from_status = proposal.status;
            }

            await db('proposals').where({ id: body.proposalId }).update({
                ...updatePayload,
            });

            await db('admin_actions').insert({
                admin_id: req.user!.userId,
                proposal_id: body.proposalId,
                action_type: 'status_update',
                description: body.description || `Status updated to ${body.status}.`,
                status_hash: statusHash,
                metadata: {
                    previousStatus: proposal.status,
                    newStatus: body.status,
                },
            });

            // Submit admin update on-chain
            let txHash: string | null = null;
            try {
                txHash = await relayerService.adminUpdate(body.proposalId, statusHash);
            } catch (relayErr) {
                logger.error({ err: relayErr }, 'Relayer failed to submit admin update');
            }

            await db('audit_log').insert({
                event_type: 'admin_status_update',
                reference_id: body.proposalId,
                reference_table: 'proposals',
                actor_id: req.user!.userId,
                hash_onchain: statusHash,
                tx_hash: txHash,
                details: { newStatus: body.status, description: body.description },
            });

            await notificationService
                .notifyStatusUpdate({
                    proposalId: body.proposalId,
                    title: proposal.title_en || proposal.title,
                    status: body.status,
                    communityId: proposal.community_id,
                    actorId: req.user!.userId,
                })
                .catch(() => undefined);

            res.json({
                message: `Proposal status updated to ${body.status}.`,
                proposalId: body.proposalId,
                statusHash,
                txHash,
            });
        } catch (err) {
            if (err instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation failed.', details: err.errors });
                return;
            }
            logger.error({ err }, 'Failed to update proposal status');
            res.status(500).json({ error: 'Failed to update status.' });
        }
    }
);

// ── POST /api/admin/unarchive ───────────────────────────────────────────────

router.post(
    '/unarchive',
    authMiddleware,
    requireRole('admin', 'superadmin'),
    async (req: Request, res: Response) => {
        try {
            const { proposalId } = req.body;
            if (!proposalId || typeof proposalId !== 'string') {
                res.status(400).json({ error: 'proposalId is required.' });
                return;
            }

            const proposal = await db('proposals').where({ id: proposalId }).first();
            if (!proposal) {
                res.status(404).json({ error: 'Proposal not found.' });
                return;
            }

            const regionMatch =
                normalizeRegionCode(proposal.region_code) === normalizeRegionCode(req.user!.regionCode);
            if (!regionMatch) {
                res.status(403).json({ error: 'Region mismatch.' });
                return;
            }

            if (proposal.status !== 'archived') {
                res.status(400).json({ error: 'Only archived proposals can be unarchived.' });
                return;
            }

            let restoredStatus = proposal.archived_from_status;
            if (!restoredStatus) {
                const totalVotes = (proposal.yes_count || 0) + (proposal.no_count || 0) + (proposal.abstain_count || 0);
                const passed = totalVotes > 0 && proposal.yes_count / totalVotes > 0.51;
                restoredStatus = proposal.result_hash ? (passed ? 'passed' : 'failed') : 'voting';
            }

            await db('proposals').where({ id: proposalId }).update({
                status: restoredStatus,
                updated_at: new Date(),
            });

            await db('admin_actions').insert({
                admin_id: req.user!.userId,
                proposal_id: proposalId,
                action_type: 'unarchive',
                description: `Proposal unarchived to ${restoredStatus}.`,
                metadata: {
                    previousStatus: 'archived',
                    restoredStatus,
                },
            });

            await notificationService
                .notifyStatusUpdate({
                    proposalId,
                    title: proposal.title_en || proposal.title,
                    status: restoredStatus,
                    communityId: proposal.community_id,
                    actorId: req.user!.userId,
                })
                .catch(() => undefined);

            res.json({ message: `Proposal restored to ${restoredStatus}.`, proposalId, status: restoredStatus });
        } catch (err) {
            logger.error({ err }, 'Failed to unarchive proposal');
            res.status(500).json({ error: 'Failed to unarchive proposal.' });
        }
    }
);

// ── GET /api/admin/audit-log ────────────────────────────────────────────────

router.get(
    '/audit-log',
    authMiddleware,
    requireRole('admin', 'superadmin'),
    async (req: Request, res: Response) => {
        try {
            const { page = '1', limit = '50' } = req.query;
            const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);

            const logs = await db('audit_log')
                .orderBy('created_at', 'desc')
                .limit(parseInt(limit as string, 10))
                .offset(offset);

            res.json({ logs });
        } catch (err) {
            logger.error({ err }, 'Failed to fetch audit log');
            res.status(500).json({ error: 'Failed to fetch audit log.' });
        }
    }
);

export default router;
