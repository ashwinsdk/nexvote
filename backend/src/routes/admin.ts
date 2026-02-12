import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import db from '../db';
import logger from '../logger';
import { authMiddleware, requireRole } from '../middleware/auth';
import { relayerService } from '../services/relayer';
import { localizeField, normalizeLocale } from '../services/translation';

const router = Router();

const normalizeRegionCode = (value?: string): string =>
    (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

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
            const locale = normalizeLocale(req.locale);
            const regionCode = req.user!.regionCode;
            const regionNormalized = normalizeRegionCode(regionCode);

            // Active proposals in the admin's region
            const activeProposals = await db('proposals')
                .whereRaw('LOWER(region_code) = ?', [regionNormalized])
                .whereIn('status', ['voting', 'active'])
                .orderBy('created_at', 'desc')
                .limit(50);

            // Finalized proposals
            const finalizedProposals = await db('proposals')
                .whereRaw('LOWER(region_code) = ?', [regionNormalized])
                .whereIn('status', ['passed', 'failed', 'implemented'])
                .orderBy('finalized_at', 'desc')
                .limit(50);

            // Communities in region
            const communities = await db('communities')
                .whereRaw('LOWER(region_code) = ?', [regionNormalized])
                .select('*');

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
            const recentActions = await db('admin_actions')
                .where({ admin_id: req.user!.userId })
                .orderBy('created_at', 'desc')
                .limit(20);

            // Donation totals
            const [donationStats] = await db('donations')
                .join('proposals', 'donations.proposal_id', 'proposals.id')
                .whereRaw('LOWER(proposals.region_code) = ?', [regionNormalized])
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
                regionCode,
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

            // Determine outcome (51% majority of cast votes)
            const totalVotes = proposal.yes_count + proposal.no_count + proposal.abstain_count;
            const passed = totalVotes > 0 && proposal.yes_count / totalVotes > 0.51;
            const finalStatus = passed ? 'passed' : 'failed';

            // Generate result hash
            const resultData = JSON.stringify({
                proposalId: proposal.id,
                yesCount: proposal.yes_count,
                noCount: proposal.no_count,
                abstainCount: proposal.abstain_count,
                status: finalStatus,
                finalizedBy: req.user!.userId,
                finalizedAt: new Date().toISOString(),
            });
            const resultHash = '0x' + crypto.createHash('sha256').update(resultData).digest('hex');

            // Update proposal
            await db('proposals').where({ id: proposalId }).update({
                status: finalStatus,
                result_hash: resultHash,
                finalized_at: new Date(),
                updated_at: new Date(),
            });

            // Record admin action
            await db('admin_actions').insert({
                admin_id: req.user!.userId,
                proposal_id: proposalId,
                action_type: 'finalize_vote',
                description: `Proposal ${finalStatus}. Yes: ${proposal.yes_count}, No: ${proposal.no_count}, Abstain: ${proposal.abstain_count}.`,
                status_hash: resultHash,
            });

            // Submit to blockchain via relayer
            let txHash: string | null = null;
            try {
                txHash = await relayerService.finalizeVote(proposalId, resultHash);
                if (txHash) {
                    await db('proposals').where({ id: proposalId }).update({ tx_hash: txHash });
                }
            } catch (relayErr) {
                logger.error({ err: relayErr }, 'Relayer failed to finalize on-chain');
            }

            // Audit log
            await db('audit_log').insert({
                event_type: 'vote_finalized',
                reference_id: proposalId,
                reference_table: 'proposals',
                actor_id: req.user!.userId,
                hash_onchain: resultHash,
                tx_hash: txHash,
                details: {
                    result: finalStatus,
                    yesCount: proposal.yes_count,
                    noCount: proposal.no_count,
                },
            });

            res.json({
                message: `Proposal ${finalStatus}.`,
                proposalId,
                status: finalStatus,
                resultHash,
                txHash,
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

            if (proposal.region_code !== req.user!.regionCode) {
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

            await db('proposals').where({ id: body.proposalId }).update({
                status: body.status,
                updated_at: new Date(),
            });

            await db('admin_actions').insert({
                admin_id: req.user!.userId,
                proposal_id: body.proposalId,
                action_type: 'status_update',
                description: body.description || `Status updated to ${body.status}.`,
                status_hash: statusHash,
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
