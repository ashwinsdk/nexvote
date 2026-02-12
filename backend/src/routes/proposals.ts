import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import db from '../db';
import { config } from '../config';
import logger from '../logger';
import { authMiddleware } from '../middleware/auth';
import { aiService } from '../services/ai';
import {
    detectLocale,
    localizeField,
    normalizeLocale,
    translateText,
} from '../services/translation';
import { relayerService } from '../services/relayer';

const router = Router();

const normalizeRegionCode = (value?: string): string =>
    (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// ── Validation ──────────────────────────────────────────────────────────────

const createProposalSchema = z.object({
    communityId: z.string().uuid(),
    title: z.string().min(10).max(300),
    text: z.string().min(50).max(10000),
    category: z.string().min(2).max(50),
    deadlineDays: z.number().int().min(1).max(90).default(7),
});

const voteSchema = z.object({
    choice: z.enum(['yes', 'no', 'abstain']),
    signedMeta: z
        .object({
            signature: z.string().optional(),
            publicKey: z.string().optional(),
            timestamp: z.number().optional(),
        })
        .optional(),
});

// ── GET /api/proposals ──────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
    try {
        const locale = normalizeLocale(req.locale);
        const {
            communityId,
            region,
            status,
            category,
            sort = 'hot',
            page = '1',
            limit = '20',
        } = req.query;

        const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);
        let query = db('proposals')
            .join('communities', 'proposals.community_id', 'communities.id')
            .join('users', 'proposals.created_by', 'users.id')
            .select(
                'proposals.*',
                'communities.name as community_name',
                'communities.slug as community_slug',
                'users.display_name as author_name',
                'users.id as author_id'
            );

        if (communityId) query = query.where('proposals.community_id', communityId as string);
        if (region) query = query.where('proposals.region_code', region as string);
        if (status) query = query.where('proposals.status', status as string);
        if (category) query = query.where('proposals.category', category as string);

        // Sorting: hot (votes + recency), new, top
        switch (sort) {
            case 'new':
                query = query.orderBy('proposals.created_at', 'desc');
                break;
            case 'top':
                query = query.orderByRaw('(proposals.yes_count - proposals.no_count) DESC');
                break;
            case 'hot':
            default:
                // Simple hotness: weighted combination of net votes and recency
                query = query.orderByRaw(`
          (proposals.yes_count - proposals.no_count) +
          EXTRACT(EPOCH FROM (proposals.created_at - NOW())) / 86400.0 * 2
          DESC
        `);
                break;
        }

        const proposals = await query
            .limit(parseInt(limit as string, 10))
            .offset(offset);

        const localized = await Promise.all(
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

        res.json({ proposals: localized });
    } catch (err) {
        logger.error({ err }, 'Failed to fetch proposals');
        res.status(500).json({ error: 'Failed to fetch proposals.' });
    }
});

// ── GET /api/proposals/eligible ─────────────────────────────────────────────

router.get('/eligible', authMiddleware, async (req: Request, res: Response) => {
    try {
        const locale = normalizeLocale(req.locale);
        const { sort = 'hot', page = '1', limit = '20' } = req.query;
        const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);

        const region = normalizeRegionCode(req.user!.regionCode);

        let query = db('proposals')
            .join('communities', 'proposals.community_id', 'communities.id')
            .join('users', 'proposals.created_by', 'users.id')
            .leftJoin('community_members as cm', function () {
                this.on('cm.community_id', 'communities.id').andOn(
                    'cm.user_id',
                    db.raw('?', [req.user!.userId])
                );
            })
            .select(
                'proposals.*',
                'communities.name as community_name',
                'communities.slug as community_slug',
                'users.display_name as author_name',
                'users.id as author_id'
            )
            .where(function () {
                this.whereRaw(
                    "LOWER(regexp_replace(communities.region_code, '[^a-z0-9]', '', 'g')) = ?",
                    [region]
                )
                    .orWhereNotNull('cm.user_id');
            });

        // Sorting: hot (votes + recency), new, top
        switch (sort) {
            case 'new':
                query = query.orderBy('proposals.created_at', 'desc');
                break;
            case 'top':
                query = query.orderByRaw('(proposals.yes_count - proposals.no_count) DESC');
                break;
            case 'hot':
            default:
                query = query.orderByRaw(`
          (proposals.yes_count - proposals.no_count) +
          EXTRACT(EPOCH FROM (proposals.created_at - NOW())) / 86400.0 * 2
          DESC
        `);
                break;
        }

        const proposals = await query
            .limit(parseInt(limit as string, 10))
            .offset(offset);

        const localized = await Promise.all(
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

        res.json({ proposals: localized });
    } catch (err) {
        logger.error({ err }, 'Failed to fetch eligible proposals');
        res.status(500).json({ error: 'Failed to fetch proposals.' });
    }
});

// ── GET /api/proposals/:id ──────────────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response) => {
    try {
        const locale = normalizeLocale(req.locale);
        const proposal = await db('proposals')
            .join('communities', 'proposals.community_id', 'communities.id')
            .join('users', 'proposals.created_by', 'users.id')
            .select(
                'proposals.*',
                'communities.name as community_name',
                'communities.slug as community_slug',
                'users.display_name as author_name',
                'users.id as author_id'
            )
            .where('proposals.id', req.params.id)
            .first();

        if (!proposal) {
            res.status(404).json({ error: 'Proposal not found.' });
            return;
        }

        // Fetch comments
        const comments = await db('comments')
            .join('users', 'comments.user_id', 'users.id')
            .select('comments.*', 'users.display_name as author_name')
            .where({ proposal_id: req.params.id, removed: false })
            .orderBy('comments.created_at', 'asc');

        const localizedProposal = {
            ...proposal,
            title: await localizeField({
                english: proposal.title_en || proposal.title,
                original: proposal.title,
                originalLocale: proposal.title_lang,
                targetLocale: locale,
            }),
            text: await localizeField({
                english: proposal.text_en || proposal.text,
                original: proposal.text,
                originalLocale: proposal.text_lang,
                targetLocale: locale,
            }),
            summary: await localizeField({
                english: proposal.summary_en || proposal.summary,
                original: proposal.summary,
                originalLocale: proposal.summary_lang,
                targetLocale: locale,
            }),
        };

        const localizedComments = await Promise.all(
            comments.map(async (comment: any) => {
                const body = await localizeField({
                    english: comment.body_en || comment.body,
                    original: comment.body,
                    originalLocale: comment.body_lang,
                    targetLocale: locale,
                });
                return {
                    ...comment,
                    body,
                };
            })
        );

        res.json({ ...localizedProposal, comments: localizedComments });
    } catch (err) {
        logger.error({ err }, 'Failed to fetch proposal');
        res.status(500).json({ error: 'Failed to fetch proposal.' });
    }
});

// ── POST /api/proposals ─────────────────────────────────────────────────────

router.post('/', authMiddleware, async (req: Request, res: Response) => {
    try {
        const body = createProposalSchema.parse(req.body);

        // Verify community membership
        const membership = await db('community_members')
            .where({ community_id: body.communityId, user_id: req.user!.userId })
            .first();

        if (!membership) {
            res.status(403).json({ error: 'You must be a member of this community to create proposals.' });
            return;
        }

        const community = await db('communities').where({ id: body.communityId }).first();
        if (!community) {
            res.status(404).json({ error: 'Community not found.' });
            return;
        }

        // Check region match
        const regionMatch =
            normalizeRegionCode(community.region_code) === normalizeRegionCode(req.user!.regionCode);
        if (!regionMatch) {
            res.status(403).json({
                error: `Region mismatch: your account is ${req.user!.regionCode}, community is ${community.region_code}.`,
            });
            return;
        }

        const titleLang = detectLocale(body.title);
        const textLang = detectLocale(body.text);
        const titleEn = titleLang === 'en' ? body.title : await translateText(body.title, titleLang, 'en');
        const textEn = textLang === 'en' ? body.text : await translateText(body.text, textLang, 'en');

        // AI: generate summary and embeddings, check for duplicates
        let summary = '';
        let duplicates: any[] = [];
        try {
            const aiResult = await aiService.processProposal(
                titleEn,
                textEn,
                community.region_code,
                body.category
            );
            summary = aiResult.summary;
            duplicates = aiResult.duplicates;
        } catch (aiErr) {
            logger.warn({ err: aiErr }, 'AI service unavailable, proceeding without summary/dedupe');
            summary = body.text.slice(0, 200) + '...';
        }

        // Block if near-duplicates found above threshold
        if (duplicates.length > 0) {
            res.status(409).json({
                error: 'Similar proposals already exist.',
                duplicates: duplicates.map((d: any) => ({
                    id: d.id,
                    title: d.title,
                    similarity: d.similarity,
                })),
            });
            return;
        }

        const deadline = new Date();
        deadline.setDate(deadline.getDate() + body.deadlineDays);

        const proposalData = JSON.stringify({
            title: titleEn,
            text: textEn,
            communityId: body.communityId,
            category: body.category,
            createdBy: req.user!.userId,
            regionCode: community.region_code,
            deadline: deadline.toISOString(),
        });
        const proposalHash = '0x' + crypto.createHash('sha256').update(proposalData).digest('hex');

        const [proposal] = await db('proposals')
            .insert({
                community_id: body.communityId,
                title: body.title,
                text: body.text,
                category: body.category,
                status: 'voting',
                deadline,
                summary,
                proposal_hash: proposalHash,
                created_by: req.user!.userId,
                region_code: community.region_code,
                title_en: titleEn,
                title_lang: titleLang,
                text_en: textEn,
                text_lang: textLang,
                summary_en: summary,
                summary_lang: 'en',
            })
            .returning('*');

        // Store embedding if AI service is available
        try {
            const embedding = await aiService.getEmbedding(`${titleEn} ${textEn}`);
            if (embedding) {
                await db('proposal_metadata').insert({
                    proposal_id: proposal.id,
                    ai_summary: summary,
                    tags: JSON.stringify([body.category]),
                    ai_categories: JSON.stringify([body.category]),
                });

                // Check if pgvector is available
                const hasVector = await db.raw(`
                    SELECT data_type 
                    FROM information_schema.columns 
                    WHERE table_name = 'proposal_metadata' 
                    AND column_name = 'embedding'
                `);

                const isVectorType = hasVector.rows[0]?.data_type === 'USER-DEFINED';

                if (isVectorType) {
                    // Store vector embedding using pgvector
                    await db.raw(
                        `UPDATE proposal_metadata SET embedding = ?::vector WHERE proposal_id = ?`,
                        [JSON.stringify(embedding), proposal.id]
                    );
                } else {
                    // Fallback: store as JSONB
                    await db('proposal_metadata')
                        .where({ proposal_id: proposal.id })
                        .update({ embedding: JSON.stringify(embedding) });
                }
            }
        } catch (embErr) {
            logger.warn({ err: embErr }, 'Failed to store embedding, continuing');
        }

        // Register proposal on-chain via relayer
        let txHash: string | null = null;
        try {
            txHash = await relayerService.registerProposal(proposalHash, proposal.id.toString(), 0);
            if (txHash) {
                await db('proposals').where({ id: proposal.id }).update({ tx_hash: txHash });
                logger.info({ proposalId: proposal.id, txHash }, 'Proposal registered on blockchain');
            }
        } catch (relayErr) {
            logger.error({ err: relayErr, proposalId: proposal.id }, 'Failed to register proposal on-chain (continuing)');
        }

        // Audit log
        await db('audit_log').insert({
            event_type: 'proposal_created',
            reference_id: proposal.id,
            reference_table: 'proposals',
            actor_id: req.user!.userId,
            hash_onchain: proposalHash,
            tx_hash: txHash,
            details: { title: body.title, communityId: body.communityId },
        });

        res.status(201).json({
            ...proposal,
            title: await localizeField({
                english: proposal.title_en || proposal.title,
                original: proposal.title,
                originalLocale: proposal.title_lang,
                targetLocale: normalizeLocale(req.locale),
            }),
            text: await localizeField({
                english: proposal.text_en || proposal.text,
                original: proposal.text,
                originalLocale: proposal.text_lang,
                targetLocale: normalizeLocale(req.locale),
            }),
            summary: await localizeField({
                english: proposal.summary_en || proposal.summary,
                original: proposal.summary,
                originalLocale: proposal.summary_lang,
                targetLocale: normalizeLocale(req.locale),
            }),
        });
    } catch (err) {
        if (err instanceof z.ZodError) {
            res.status(400).json({ error: 'Validation failed.', details: err.errors });
            return;
        }
        logger.error({ err }, 'Failed to create proposal');
        res.status(500).json({ error: 'Failed to create proposal.' });
    }
});

// ── POST /api/proposals/:id/vote ────────────────────────────────────────────

router.post('/:id/vote', authMiddleware, async (req: Request, res: Response) => {
    try {
        const body = voteSchema.parse(req.body);
        const proposalId = req.params.id;

        const proposal = await db('proposals').where({ id: proposalId }).first();
        if (!proposal) {
            res.status(404).json({ error: 'Proposal not found.' });
            return;
        }

        // Check deadline
        if (proposal.deadline && new Date(proposal.deadline) < new Date()) {
            res.status(400).json({ error: 'Voting deadline has passed.' });
            return;
        }

        // Check status
        if (proposal.status !== 'voting') {
            res.status(400).json({ error: 'Proposal is not in voting status.' });
            return;
        }

        // Check region match
        if (proposal.region_code !== req.user!.regionCode) {
            res.status(403).json({ error: 'You are not in the correct region to vote on this proposal.' });
            return;
        }

        // Check community membership
        const membership = await db('community_members')
            .where({ community_id: proposal.community_id, user_id: req.user!.userId })
            .first();
        if (!membership) {
            res.status(403).json({ error: 'You must be a community member to vote.' });
            return;
        }

        // Check for existing vote (allow update until deadline)
        const existingVote = await db('votes')
            .where({ proposal_id: proposalId, user_id: req.user!.userId })
            .first();

        if (existingVote) {
            // Undo previous vote count
            const oldChoiceCol = `${existingVote.choice}_count`;
            await db('proposals').where({ id: proposalId }).decrement(oldChoiceCol, 1);

            // Update vote
            await db('votes')
                .where({ id: existingVote.id })
                .update({
                    choice: body.choice,
                    signed_meta: body.signedMeta ? JSON.stringify(body.signedMeta) : null,
                    updated_at: new Date(),
                });
        } else {
            await db('votes').insert({
                proposal_id: proposalId,
                user_id: req.user!.userId,
                choice: body.choice,
                signed_meta: body.signedMeta ? JSON.stringify(body.signedMeta) : null,
            });
        }

        // Increment new vote count
        const newChoiceCol = `${body.choice}_count`;
        await db('proposals').where({ id: proposalId }).increment(newChoiceCol, 1);

        // Fetch updated counts
        const updated = await db('proposals')
            .where({ id: proposalId })
            .select('yes_count', 'no_count', 'abstain_count')
            .first();

        res.json({
            message: existingVote ? 'Vote updated.' : 'Vote recorded.',
            choice: body.choice,
            counts: {
                yes: updated.yes_count,
                no: updated.no_count,
                abstain: updated.abstain_count,
            },
        });
    } catch (err) {
        if (err instanceof z.ZodError) {
            res.status(400).json({ error: 'Validation failed.', details: err.errors });
            return;
        }
        logger.error({ err }, 'Failed to record vote');
        res.status(500).json({ error: 'Failed to record vote.' });
    }
});

// ── DELETE /api/proposals/:id/vote (undo) ───────────────────────────────────

router.delete('/:id/vote', authMiddleware, async (req: Request, res: Response) => {
    try {
        const proposalId = req.params.id;

        const proposal = await db('proposals').where({ id: proposalId }).first();
        if (!proposal) {
            res.status(404).json({ error: 'Proposal not found.' });
            return;
        }

        if (proposal.deadline && new Date(proposal.deadline) < new Date()) {
            res.status(400).json({ error: 'Voting deadline has passed. Cannot undo vote.' });
            return;
        }

        const existingVote = await db('votes')
            .where({ proposal_id: proposalId, user_id: req.user!.userId })
            .first();

        if (!existingVote) {
            res.status(404).json({ error: 'No vote found to undo.' });
            return;
        }

        // Decrement count
        const choiceCol = `${existingVote.choice}_count`;
        await db('proposals').where({ id: proposalId }).decrement(choiceCol, 1);

        // Delete vote
        await db('votes').where({ id: existingVote.id }).del();

        const updated = await db('proposals')
            .where({ id: proposalId })
            .select('yes_count', 'no_count', 'abstain_count')
            .first();

        res.json({
            message: 'Vote undone.',
            counts: {
                yes: updated.yes_count,
                no: updated.no_count,
                abstain: updated.abstain_count,
            },
        });
    } catch (err) {
        logger.error({ err }, 'Failed to undo vote');
        res.status(500).json({ error: 'Failed to undo vote.' });
    }
});

// ── POST /api/proposals/:id/comment ─────────────────────────────────────────

router.post('/:id/comment', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { body: commentBody, parentId } = req.body;

        if (!commentBody || typeof commentBody !== 'string' || commentBody.length < 2) {
            res.status(400).json({ error: 'Comment body is required (min 2 characters).' });
            return;
        }

        const proposal = await db('proposals').where({ id: req.params.id }).first();
        if (!proposal) {
            res.status(404).json({ error: 'Proposal not found.' });
            return;
        }

        const membership = await db('community_members')
            .where({ community_id: proposal.community_id, user_id: req.user!.userId })
            .first();
        if (!membership) {
            res.status(403).json({ error: 'You must be a community member to comment.' });
            return;
        }

        const bodyLang = detectLocale(commentBody);
        const bodyEn = bodyLang === 'en' ? commentBody : await translateText(commentBody, bodyLang, 'en');

        const [comment] = await db('comments')
            .insert({
                proposal_id: req.params.id,
                user_id: req.user!.userId,
                parent_id: parentId || null,
                body: commentBody,
                body_en: bodyEn,
                body_lang: bodyLang,
            })
            .returning('*');

        res.status(201).json({
            ...comment,
            body: await localizeField({
                english: comment.body_en || comment.body,
                original: comment.body,
                originalLocale: comment.body_lang,
                targetLocale: normalizeLocale(req.locale),
            }),
        });
    } catch (err) {
        logger.error({ err }, 'Failed to add comment');
        res.status(500).json({ error: 'Failed to add comment.' });
    }
});

export default router;
