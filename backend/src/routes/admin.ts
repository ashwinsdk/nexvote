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

const implementationUpdateSchema = z.object({
    status: z.enum(['not_started', 'in_progress', 'blocked', 'completed']),
    department: z.string().max(200).optional(),
    completionPercent: z.number().int().min(0).max(100),
    totalBudget: z.number().nonnegative().optional(),
    targetDate: z.string().datetime().optional(),
    publicComplete: z.boolean().optional(),
});

const milestoneSchema = z.object({
    title: z.string().min(3).max(300),
    description: z.string().max(3000).optional(),
    status: z.enum(['pending', 'in_progress', 'completed', 'blocked']).optional(),
    dueDate: z.string().datetime().optional(),
});

const implementationNoteSchema = z.object({
    message: z.string().min(5).max(5000),
    completionPercent: z.number().int().min(0).max(100).optional(),
});

const budgetReleaseSchema = z.object({
    stage: z.number().int().min(1),
    amount: z.number().positive(),
    notes: z.string().max(2000).optional(),
});

const proofFileSchema = z.object({
    label: z.string().min(2).max(200),
    url: z.string().url(),
    mimeType: z.string().max(100).optional(),
});

const resolveFraudAlertSchema = z.object({
    status: z.enum(['resolved', 'dismissed']),
    notes: z.string().max(2000).optional(),
});

const canManageImplementation = async (proposal: any, userId: string, role: string): Promise<boolean> => {
    if (role === 'admin' || role === 'superadmin') {
        return true;
    }

    const membership = await db('community_members')
        .where({ community_id: proposal.community_id, user_id: userId })
        .first();

    if (!membership) {
        return false;
    }

    return ['owner', 'moderator'].includes(membership.role);
};

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

// ── GET /api/admin/transparency ─────────────────────────────────────────────

router.get(
    '/transparency',
    authMiddleware,
    requireRole('admin', 'superadmin'),
    async (req: Request, res: Response) => {
        try {
            const totalProposalsRow = await db('proposals').count('* as count').first();
            const activeVotesRow = await db('proposals').where({ status: 'voting' }).count('* as count').first();
            const approvedRow = await db('proposals').where({ status: 'passed' }).count('* as count').first();
            const outcomes = await db('proposals')
                .select('status')
                .count('* as count')
                .whereIn('status', ['passed', 'failed', 'implemented', 'archived'])
                .groupBy('status');

            const [participationStats] = await db('proposals').select(
                db.raw('COALESCE(AVG(participation_rate), 0) as avg_participation_rate'),
                db.raw("COALESCE(AVG(CASE WHEN quorum_met THEN 1 ELSE 0 END), 0) as quorum_success_rate")
            );

            const implementationByStatus = await db('proposal_implementations')
                .select('status')
                .count('* as count')
                .groupBy('status');

            const [onchainRow] = await db('proposals').select(
                db.raw("COUNT(*) FILTER (WHERE tx_hash IS NOT NULL) as proposal_tx_count"),
                db.raw("COUNT(*) FILTER (WHERE result_hash IS NOT NULL) as finalized_hash_count")
            );

            const totalProposals = parseInt(String(totalProposalsRow?.count || '0'), 10);
            const approvedCount = parseInt(String(approvedRow?.count || '0'), 10);
            const approvalRate = totalProposals > 0 ? (approvedCount / totalProposals) * 100 : 0;

            res.json({
                totals: {
                    proposals: totalProposals,
                    activeVotes: parseInt(String(activeVotesRow?.count || '0'), 10),
                    approvalRate,
                    participationRate: Number(participationStats?.avg_participation_rate || 0),
                    quorumSuccessRate: Number(participationStats?.quorum_success_rate || 0),
                },
                finalOutcomes: outcomes,
                implementationStatus: implementationByStatus,
                onChainVerification: {
                    proposalAnchored: parseInt(String(onchainRow?.proposal_tx_count || '0'), 10),
                    resultAnchored: parseInt(String(onchainRow?.finalized_hash_count || '0'), 10),
                },
            });
        } catch (err) {
            logger.error({ err }, 'Failed to fetch transparency metrics');
            res.status(500).json({ error: 'Failed to fetch transparency metrics.' });
        }
    }
);

// ── GET /api/admin/implementations/overview ───────────────────────────────

router.get(
    '/implementations/overview',
    authMiddleware,
    requireRole('admin', 'superadmin'),
    async (_req: Request, res: Response) => {
        try {
            const rows = await db('proposal_implementations as pi')
                .join('proposals as p', 'pi.proposal_id', 'p.id')
                .join('communities as c', 'p.community_id', 'c.id')
                .select(
                    'pi.*',
                    'p.title as proposal_title',
                    'p.status as proposal_status',
                    'c.id as community_id',
                    'c.name as community_name'
                )
                .orderBy('pi.updated_at', 'desc');

            res.json({ implementations: rows });
        } catch (err) {
            logger.error({ err }, 'Failed to fetch implementation overview');
            res.status(500).json({ error: 'Failed to fetch implementation overview.' });
        }
    }
);

// ── GET /api/admin/proposals/:id/implementation ───────────────────────────

router.get(
    '/proposals/:id/implementation',
    authMiddleware,
    async (req: Request, res: Response) => {
        try {
            const proposalId = String(req.params.id);
            const proposal = await db('proposals').where({ id: proposalId }).first();
            if (!proposal) {
                res.status(404).json({ error: 'Proposal not found.' });
                return;
            }

            const implementation = await db('proposal_implementations')
                .where({ proposal_id: proposalId })
                .first();

            if (!implementation) {
                res.json({ implementation: null, milestones: [], updates: [], budgetReleases: [], proofFiles: [] });
                return;
            }

            const [milestones, updates, budgetReleases, proofFiles] = await Promise.all([
                db('implementation_milestones').where({ implementation_id: implementation.id }).orderBy('created_at', 'asc'),
                db('implementation_updates').where({ implementation_id: implementation.id }).orderBy('created_at', 'desc'),
                db('implementation_budget_releases').where({ implementation_id: implementation.id }).orderBy('stage', 'asc'),
                db('implementation_proof_files').where({ implementation_id: implementation.id }).orderBy('created_at', 'desc'),
            ]);

            res.json({ implementation, milestones, updates, budgetReleases, proofFiles });
        } catch (err) {
            logger.error({ err }, 'Failed to fetch implementation details');
            res.status(500).json({ error: 'Failed to fetch implementation details.' });
        }
    }
);

// ── PUT /api/admin/proposals/:id/implementation ───────────────────────────

router.put(
    '/proposals/:id/implementation',
    authMiddleware,
    async (req: Request, res: Response) => {
        try {
            const body = implementationUpdateSchema.parse(req.body);
            const proposalId = String(req.params.id);
            const proposal = await db('proposals').where({ id: proposalId }).first();
            if (!proposal) {
                res.status(404).json({ error: 'Proposal not found.' });
                return;
            }

            const allowed = await canManageImplementation(proposal, req.user!.userId, req.user!.role);
            if (!allowed) {
                res.status(403).json({ error: 'Only community owner/moderator or admin can update implementation.' });
                return;
            }

            const existingImplementation = await db('proposal_implementations')
                .where({ proposal_id: proposalId })
                .first();

            await db('proposal_implementations')
                .insert({
                    proposal_id: proposalId,
                    status: body.status,
                    department: body.department || null,
                    completion_percent: body.completionPercent,
                    total_budget: body.totalBudget || null,
                    target_date: body.targetDate ? new Date(body.targetDate) : null,
                    public_complete: body.publicComplete ?? false,
                    completed_at: body.status === 'completed' ? new Date() : null,
                    updated_by: req.user!.userId,
                })
                .onConflict('proposal_id')
                .merge({
                    status: body.status,
                    department: body.department ?? existingImplementation?.department ?? null,
                    completion_percent: body.completionPercent,
                    total_budget: body.totalBudget ?? existingImplementation?.total_budget ?? null,
                    target_date: body.targetDate
                        ? new Date(body.targetDate)
                        : (existingImplementation?.target_date ?? null),
                    public_complete: body.publicComplete ?? existingImplementation?.public_complete ?? false,
                    completed_at: body.status === 'completed' ? new Date() : null,
                    updated_by: req.user!.userId,
                    updated_at: new Date(),
                });

            if (body.status === 'completed') {
                await db('proposals').where({ id: proposalId }).update({
                    status: 'implemented',
                    updated_at: new Date(),
                });
            }

            await db('audit_log').insert({
                event_type: 'implementation_updated',
                reference_id: proposalId,
                reference_table: 'proposals',
                actor_id: req.user!.userId,
                details: {
                    status: body.status,
                    completionPercent: body.completionPercent,
                    department: body.department || null,
                },
            });

            res.json({ message: 'Implementation updated.', proposalId });
        } catch (err) {
            if (err instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation failed.', details: err.errors });
                return;
            }
            logger.error({ err }, 'Failed to update implementation');
            res.status(500).json({ error: 'Failed to update implementation.' });
        }
    }
);

// ── POST /api/admin/proposals/:id/implementation/milestones ───────────────

router.post(
    '/proposals/:id/implementation/milestones',
    authMiddleware,
    async (req: Request, res: Response) => {
        try {
            const body = milestoneSchema.parse(req.body);
            const proposalId = String(req.params.id);

            const proposal = await db('proposals').where({ id: proposalId }).first();
            if (!proposal) {
                res.status(404).json({ error: 'Proposal not found.' });
                return;
            }

            const allowed = await canManageImplementation(proposal, req.user!.userId, req.user!.role);
            if (!allowed) {
                res.status(403).json({ error: 'Insufficient permissions.' });
                return;
            }

            const implementation = await db('proposal_implementations').where({ proposal_id: proposalId }).first();
            if (!implementation) {
                res.status(400).json({ error: 'Create implementation details first.' });
                return;
            }

            const [milestone] = await db('implementation_milestones')
                .insert({
                    implementation_id: implementation.id,
                    title: body.title,
                    description: body.description || null,
                    status: body.status || 'pending',
                    due_date: body.dueDate ? new Date(body.dueDate) : null,
                    updated_by: req.user!.userId,
                })
                .returning('*');

            res.status(201).json(milestone);
        } catch (err) {
            if (err instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation failed.', details: err.errors });
                return;
            }
            logger.error({ err }, 'Failed to add implementation milestone');
            res.status(500).json({ error: 'Failed to add implementation milestone.' });
        }
    }
);

// ── POST /api/admin/proposals/:id/implementation/updates ──────────────────

router.post(
    '/proposals/:id/implementation/updates',
    authMiddleware,
    async (req: Request, res: Response) => {
        try {
            const body = implementationNoteSchema.parse(req.body);
            const proposalId = String(req.params.id);
            const proposal = await db('proposals').where({ id: proposalId }).first();
            if (!proposal) {
                res.status(404).json({ error: 'Proposal not found.' });
                return;
            }

            const allowed = await canManageImplementation(proposal, req.user!.userId, req.user!.role);
            if (!allowed) {
                res.status(403).json({ error: 'Insufficient permissions.' });
                return;
            }

            const implementation = await db('proposal_implementations').where({ proposal_id: proposalId }).first();
            if (!implementation) {
                res.status(400).json({ error: 'Create implementation details first.' });
                return;
            }

            const [update] = await db('implementation_updates')
                .insert({
                    implementation_id: implementation.id,
                    message: body.message,
                    completion_percent: body.completionPercent || null,
                    author_id: req.user!.userId,
                })
                .returning('*');

            if (typeof body.completionPercent === 'number') {
                await db('proposal_implementations').where({ id: implementation.id }).update({
                    completion_percent: body.completionPercent,
                    updated_by: req.user!.userId,
                    updated_at: new Date(),
                });
            }

            res.status(201).json(update);
        } catch (err) {
            if (err instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation failed.', details: err.errors });
                return;
            }
            logger.error({ err }, 'Failed to add implementation update');
            res.status(500).json({ error: 'Failed to add implementation update.' });
        }
    }
);

// ── POST /api/admin/proposals/:id/implementation/budget-releases ──────────

router.post(
    '/proposals/:id/implementation/budget-releases',
    authMiddleware,
    async (req: Request, res: Response) => {
        try {
            const body = budgetReleaseSchema.parse(req.body);
            const proposalId = String(req.params.id);
            const proposal = await db('proposals').where({ id: proposalId }).first();
            if (!proposal) {
                res.status(404).json({ error: 'Proposal not found.' });
                return;
            }

            const allowed = await canManageImplementation(proposal, req.user!.userId, req.user!.role);
            if (!allowed) {
                res.status(403).json({ error: 'Insufficient permissions.' });
                return;
            }

            const implementation = await db('proposal_implementations').where({ proposal_id: proposalId }).first();
            if (!implementation) {
                res.status(400).json({ error: 'Create implementation details first.' });
                return;
            }

            const [release] = await db('implementation_budget_releases')
                .insert({
                    implementation_id: implementation.id,
                    stage: body.stage,
                    amount: body.amount,
                    notes: body.notes || null,
                    approved_by: req.user!.userId,
                })
                .returning('*');

            await db('proposal_implementations').where({ id: implementation.id }).update({
                released_budget: db.raw('released_budget + ?', [body.amount]),
                updated_by: req.user!.userId,
                updated_at: new Date(),
            });

            res.status(201).json(release);
        } catch (err) {
            if (err instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation failed.', details: err.errors });
                return;
            }
            logger.error({ err }, 'Failed to add implementation budget release');
            res.status(500).json({ error: 'Failed to add implementation budget release.' });
        }
    }
);

// ── POST /api/admin/proposals/:id/implementation/proof ────────────────────

router.post(
    '/proposals/:id/implementation/proof',
    authMiddleware,
    async (req: Request, res: Response) => {
        try {
            const body = proofFileSchema.parse(req.body);
            const proposalId = String(req.params.id);
            const proposal = await db('proposals').where({ id: proposalId }).first();
            if (!proposal) {
                res.status(404).json({ error: 'Proposal not found.' });
                return;
            }

            const allowed = await canManageImplementation(proposal, req.user!.userId, req.user!.role);
            if (!allowed) {
                res.status(403).json({ error: 'Insufficient permissions.' });
                return;
            }

            const implementation = await db('proposal_implementations').where({ proposal_id: proposalId }).first();
            if (!implementation) {
                res.status(400).json({ error: 'Create implementation details first.' });
                return;
            }

            const [proof] = await db('implementation_proof_files')
                .insert({
                    implementation_id: implementation.id,
                    label: body.label,
                    url: body.url,
                    mime_type: body.mimeType || null,
                    uploaded_by: req.user!.userId,
                })
                .returning('*');

            res.status(201).json(proof);
        } catch (err) {
            if (err instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation failed.', details: err.errors });
                return;
            }
            logger.error({ err }, 'Failed to upload implementation proof');
            res.status(500).json({ error: 'Failed to upload implementation proof.' });
        }
    }
);

// ── GET /api/admin/fraud-alerts ───────────────────────────────────────────

router.get(
    '/fraud-alerts',
    authMiddleware,
    requireRole('admin', 'superadmin'),
    async (req: Request, res: Response) => {
        try {
            const status = String(req.query.status || 'open');
            const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'), 10)));

            const rows = await db('fraud_alerts')
                .where(status === 'all' ? {} : { status })
                .orderBy('created_at', 'desc')
                .limit(limit);

            res.json({ alerts: rows });
        } catch (err) {
            logger.error({ err }, 'Failed to fetch fraud alerts');
            res.status(500).json({ error: 'Failed to fetch fraud alerts.' });
        }
    }
);

// ── POST /api/admin/fraud-alerts/:id/resolve ──────────────────────────────

router.post(
    '/fraud-alerts/:id/resolve',
    authMiddleware,
    requireRole('admin', 'superadmin'),
    async (req: Request, res: Response) => {
        try {
            const alertId = String(req.params.id);
            const body = resolveFraudAlertSchema.parse(req.body);

            const updated = await db('fraud_alerts')
                .where({ id: alertId })
                .update({
                    status: body.status,
                    resolution_notes: body.notes || null,
                    resolved_by: req.user!.userId,
                    resolved_at: new Date(),
                    updated_at: new Date(),
                });

            if (!updated) {
                res.status(404).json({ error: 'Fraud alert not found.' });
                return;
            }

            await db('audit_log').insert({
                event_type: 'fraud_alert_resolved',
                reference_id: alertId,
                reference_table: 'fraud_alerts',
                actor_id: req.user!.userId,
                details: {
                    status: body.status,
                    notes: body.notes || null,
                },
            });

            res.json({ message: 'Fraud alert updated.' });
        } catch (err) {
            if (err instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation failed.', details: err.errors });
                return;
            }
            logger.error({ err }, 'Failed to resolve fraud alert');
            res.status(500).json({ error: 'Failed to resolve fraud alert.' });
        }
    }
);

export default router;
