import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
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
import {
    finalizeExpiredProposals,
    finalizeIfExpired,
} from '../services/votingLifecycle';
import { notificationService } from '../services/notifications';
import { analyzeVoteRiskSignals } from '../services/riskSignals';
import { createFraudAlert } from '../services/fraud';

const router = Router();

const normalizeRegionCode = (value?: string): string =>
    (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const ABUSIVE_TERMS = ['abuse', 'idiot', 'hate', 'stupid', 'trash'];

const detectSentiment = (text: string): { label: string; confidence: number } => {
    const value = text.toLowerCase();
    const positive = ['support', 'benefit', 'good', 'improve', 'help'];
    const negative = ['risk', 'harm', 'bad', 'waste', 'concern'];
    const pos = positive.filter((word) => value.includes(word)).length;
    const neg = negative.filter((word) => value.includes(word)).length;
    if (pos === neg) {
        return { label: 'neutral', confidence: 0.5 };
    }
    const total = Math.max(1, pos + neg);
    return {
        label: pos > neg ? 'positive' : 'negative',
        confidence: Math.min(0.95, Math.max(0.55, Math.abs(pos - neg) / total + 0.5)),
    };
};

const detectCluster = (text: string): string => {
    const value = text.toLowerCase();
    if (value.includes('budget') || value.includes('cost') || value.includes('fund')) {
        return 'budget';
    }
    if (value.includes('timeline') || value.includes('deadline') || value.includes('phase')) {
        return 'timeline';
    }
    if (value.includes('benefit') || value.includes('impact') || value.includes('public')) {
        return 'impact';
    }
    if (value.includes('risk') || value.includes('safety') || value.includes('fraud')) {
        return 'risk';
    }
    return 'general';
};

const detectAbuseSignals = (text: string): { autoHide: boolean; flags: string[] } => {
    const value = text.toLowerCase();
    const flags: string[] = [];
    if (ABUSIVE_TERMS.some((term) => value.includes(term))) {
        flags.push('abusive_language');
    }
    if ((value.match(/https?:\/\//g) || []).length > 3) {
        flags.push('link_spam');
    }
    if (/([!?])\1{5,}/.test(value) || /(.)\1{8,}/.test(value)) {
        flags.push('spam_pattern');
    }
    return {
        autoHide: flags.length > 0,
        flags,
    };
};

const parseAttachmentProof = (value: unknown): string[] => {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean);
};

const extractUserIdFromAuthHeader = (authorization?: string): string | null => {
    if (!authorization || !authorization.startsWith('Bearer ')) {
        return null;
    }

    const token = authorization.slice(7).trim();
    if (!token) {
        return null;
    }

    try {
        const payload = jwt.verify(token, config.jwtSecret) as { userId?: string };
        return payload?.userId || null;
    } catch {
        return null;
    }
};

const canReviewProposal = async (proposal: any, userId: string, role: string): Promise<boolean> => {
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

const getParticipationInfo = async (proposal: any): Promise<{
    eligibleVoters: number;
    totalVotes: number;
    participationRate: number;
    quorumPercent: number;
    minVoterCount: number;
    quorumMet: boolean;
}> => {
    const settings = await db('community_governance_settings')
        .where({ community_id: proposal.community_id, enabled: true })
        .first();

    const quorumPercent = Number(settings?.quorum_percent ?? 20);
    const minVoterCount = Number(settings?.min_voter_count ?? 10);
    const [row] = await db('community_members')
        .where({ community_id: proposal.community_id })
        .where((qb) => {
            qb.where('status', 'approved').orWhereNull('status');
        })
        .count('* as count');

    const eligibleVoters = parseInt(String(row?.count || '0'), 10);
    const totalVotes = proposal.yes_count + proposal.no_count + proposal.abstain_count;
    const participationRate = eligibleVoters > 0 ? (totalVotes / eligibleVoters) * 100 : 0;
    const quorumMet = totalVotes >= minVoterCount && participationRate >= quorumPercent;

    return {
        eligibleVoters,
        totalVotes,
        participationRate,
        quorumPercent,
        minVoterCount,
        quorumMet,
    };
};

// ── Validation ──────────────────────────────────────────────────────────────

const createProposalSchema = z.object({
    communityId: z.string().uuid(),
    title: z.string().min(10).max(300),
    text: z.string().min(50).max(10000),
    category: z.string().min(2).max(50),
    problemStatement: z.string().min(20).max(5000),
    expectedCost: z.number().nonnegative(),
    beneficiaries: z.string().min(10).max(2000),
    timeline: z.string().min(5).max(1000),
    impactSummary: z.string().min(20).max(4000),
    riskAnalysis: z.string().min(20).max(4000),
    attachmentsProof: z.array(z.string().url()).min(1),
    submitForReview: z.boolean().optional().default(false),
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

const extendDeadlineSchema = z.object({
    days: z.number().int().min(1).max(30),
    reason: z.string().max(500).optional(),
});

const createTemplateSchema = z.object({
    communityId: z.string().uuid().optional(),
    name: z.string().min(3).max(200),
    description: z.string().max(2000).optional(),
    category: z.string().min(2).max(50),
    isDefault: z.boolean().optional().default(false),
    fields: z.array(
        z.object({
            fieldKey: z.string().min(2).max(100),
            label: z.string().min(2).max(150),
            fieldType: z.string().min(2).max(50).optional(),
            required: z.boolean().optional(),
            placeholder: z.string().max(500).optional(),
            helpText: z.string().max(1000).optional(),
            displayOrder: z.number().int().min(0).optional(),
        })
    ).min(1),
});

const templateCreateFromSchema = z.object({
    communityId: z.string().uuid(),
    title: z.string().min(10).max(300),
    text: z.string().min(50).max(10000),
    deadlineDays: z.number().int().min(1).max(90).default(7),
    values: z.record(z.string(), z.any()).optional(),
    submitForReview: z.boolean().optional().default(true),
});

const reviewActionSchema = z.object({
    action: z.enum(['approve', 'request_changes']),
    notes: z.string().max(2000).optional(),
});

// ── GET /api/proposals/templates ───────────────────────────────────────────

router.get('/templates', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { communityId, category } = req.query;

        let query = db('proposal_templates')
            .where({ enabled: true })
            .orderBy('is_default', 'desc')
            .orderBy('created_at', 'desc');

        if (communityId) {
            query = query.where((qb) => {
                qb.where({ community_id: String(communityId) }).orWhere({ is_default: true });
            });
        }

        if (category) {
            query = query.where({ category: String(category) });
        }

        const templates = await query;

        const withFields = await Promise.all(
            templates.map(async (template: any) => {
                const fields = await db('proposal_template_fields')
                    .where({ template_id: template.id })
                    .orderBy('display_order', 'asc');
                return { ...template, fields };
            })
        );

        res.json({ templates: withFields });
    } catch (err) {
        logger.error({ err }, 'Failed to fetch proposal templates');
        res.status(500).json({ error: 'Failed to fetch proposal templates.' });
    }
});

// ── POST /api/proposals/templates ──────────────────────────────────────────

router.post('/templates', authMiddleware, async (req: Request, res: Response) => {
    try {
        const body = createTemplateSchema.parse(req.body);
        if (body.communityId) {
            const membership = await db('community_members')
                .where({ community_id: body.communityId, user_id: req.user!.userId })
                .first();

            const isAllowedRole = membership && ['owner', 'moderator'].includes(membership.role);
            const isAdmin = req.user!.role === 'admin' || req.user!.role === 'superadmin';

            if (!isAllowedRole && !isAdmin) {
                res.status(403).json({ error: 'Only community owner/moderator or admin can create templates.' });
                return;
            }
        }

        const [template] = await db('proposal_templates')
            .insert({
                community_id: body.communityId || null,
                name: body.name,
                description: body.description || null,
                category: body.category,
                is_default: body.isDefault,
                enabled: true,
                created_by: req.user!.userId,
            })
            .returning('*');

        await db('proposal_template_fields').insert(
            body.fields.map((field, index) => ({
                template_id: template.id,
                field_key: field.fieldKey,
                label: field.label,
                field_type: field.fieldType || 'text',
                required: field.required ?? false,
                placeholder: field.placeholder || null,
                help_text: field.helpText || null,
                display_order: field.displayOrder ?? index,
            }))
        );

        const fields = await db('proposal_template_fields')
            .where({ template_id: template.id })
            .orderBy('display_order', 'asc');

        await db('audit_log').insert({
            event_type: 'proposal_template_created',
            reference_id: template.id,
            reference_table: 'proposal_templates',
            actor_id: req.user!.userId,
            details: { name: body.name, category: body.category },
        });

        res.status(201).json({ ...template, fields });
    } catch (err) {
        if (err instanceof z.ZodError) {
            res.status(400).json({ error: 'Validation failed.', details: err.errors });
            return;
        }
        logger.error({ err }, 'Failed to create proposal template');
        res.status(500).json({ error: 'Failed to create proposal template.' });
    }
});

// ── GET /api/proposals/templates/:id ───────────────────────────────────────

router.get('/templates/:id', authMiddleware, async (req: Request, res: Response) => {
    try {
        const templateId = String(req.params.id);
        const template = await db('proposal_templates').where({ id: templateId, enabled: true }).first();
        if (!template) {
            res.status(404).json({ error: 'Template not found.' });
            return;
        }

        const fields = await db('proposal_template_fields')
            .where({ template_id: templateId })
            .orderBy('display_order', 'asc');

        res.json({ ...template, fields });
    } catch (err) {
        logger.error({ err }, 'Failed to fetch proposal template');
        res.status(500).json({ error: 'Failed to fetch proposal template.' });
    }
});

// ── POST /api/proposals/from-template/:templateId ─────────────────────────

router.post('/from-template/:templateId', authMiddleware, async (req: Request, res: Response) => {
    try {
        const templateId = String(req.params.templateId);
        const body = templateCreateFromSchema.parse(req.body);

        const template = await db('proposal_templates').where({ id: templateId, enabled: true }).first();
        if (!template) {
            res.status(404).json({ error: 'Template not found.' });
            return;
        }

        const fields = await db('proposal_template_fields').where({ template_id: templateId });
        const values = body.values || {};
        const requiredMissing = fields
            .filter((field: any) => field.required)
            .filter((field: any) => {
                const value = values[field.field_key];
                if (value === undefined || value === null) return true;
                if (typeof value === 'string' && value.trim().length === 0) return true;
                return false;
            })
            .map((field: any) => field.field_key);

        if (requiredMissing.length > 0) {
            res.status(400).json({
                error: 'Missing required template fields.',
                missing: requiredMissing,
            });
            return;
        }

        const createPayload = {
            communityId: body.communityId,
            title: body.title,
            text: body.text,
            category: template.category,
            problemStatement: String(values.problemStatement || values.problem_statement || body.text).slice(0, 5000),
            expectedCost: Number(values.expectedCost || values.expected_cost || 0),
            beneficiaries: String(values.beneficiaries || 'Not specified'),
            timeline: String(values.timeline || 'Not specified'),
            impactSummary: String(values.impactSummary || values.impact_summary || body.text).slice(0, 4000),
            riskAnalysis: String(values.riskAnalysis || values.risk_analysis || 'Risk to be evaluated.'),
            attachmentsProof: Array.isArray(values.attachmentsProof)
                ? values.attachmentsProof
                : [String(values.attachmentProofUrl || values.attachment_proof_url || 'https://example.com/proof')],
            submitForReview: body.submitForReview,
            deadlineDays: body.deadlineDays,
        };

        const attachmentsProof = parseAttachmentProof(createPayload.attachmentsProof);
        if (attachmentsProof.length === 0) {
            res.status(400).json({ error: 'At least one attachment or proof URL is required.' });
            return;
        }

        const membership = await db('community_members')
            .where({ community_id: createPayload.communityId, user_id: req.user!.userId })
            .first();

        if (!membership) {
            res.status(403).json({ error: 'You must be a member of this community to create proposals.' });
            return;
        }

        const community = await db('communities').where({ id: createPayload.communityId }).first();
        if (!community) {
            res.status(404).json({ error: 'Community not found.' });
            return;
        }

        const regionMatch =
            normalizeRegionCode(community.region_code) === normalizeRegionCode(req.user!.regionCode);
        if (!regionMatch) {
            res.status(403).json({
                error: `Region mismatch: your account is ${req.user!.regionCode}, community is ${community.region_code}.`,
            });
            return;
        }

        const titleLang = await detectLocale(createPayload.title);
        const textLang = await detectLocale(createPayload.text);
        const titleEn =
            titleLang === 'en'
                ? createPayload.title
                : await translateText(createPayload.title, titleLang, 'en');
        const textEn =
            textLang === 'en'
                ? createPayload.text
                : await translateText(createPayload.text, textLang, 'en');

        let summary = '';
        try {
            const aiResult = await aiService.processProposal(
                titleEn,
                textEn,
                community.region_code,
                createPayload.category
            );
            summary = aiResult.summary;
        } catch (aiErr) {
            logger.warn({ err: aiErr }, 'AI service unavailable for template-based proposal');
            summary = createPayload.text.slice(0, 200) + '...';
        }

        const deadline = new Date();
        deadline.setDate(deadline.getDate() + createPayload.deadlineDays);

        const [eligibleSnapshotRow] = await db('community_members')
            .where({ community_id: createPayload.communityId })
            .where((qb) => {
                qb.where('status', 'approved').orWhereNull('status');
            })
            .count('* as count');
        const eligibleVoterCountSnapshot = parseInt(String(eligibleSnapshotRow?.count || '0'), 10);

        const proposalData = JSON.stringify({
            title: titleEn,
            text: textEn,
            communityId: createPayload.communityId,
            category: createPayload.category,
            createdBy: req.user!.userId,
            regionCode: community.region_code,
            deadline: deadline.toISOString(),
            templateId,
            templateValues: values,
        });
        const proposalHash = '0x' + crypto.createHash('sha256').update(proposalData).digest('hex');

        const [proposal] = await db('proposals')
            .insert({
                community_id: createPayload.communityId,
                title: createPayload.title,
                text: createPayload.text,
                category: createPayload.category,
                status: 'draft',
                deadline,
                summary,
                proposal_hash: proposalHash,
                created_by: req.user!.userId,
                region_code: community.region_code,
                problem_statement: createPayload.problemStatement,
                beneficiaries: createPayload.beneficiaries,
                timeline: createPayload.timeline,
                budget_estimate: createPayload.expectedCost,
                impact_summary: createPayload.impactSummary,
                risk_analysis: createPayload.riskAnalysis,
                attachments_proof: JSON.stringify(attachmentsProof),
                review_status: createPayload.submitForReview ? 'pending_review' : 'draft',
                submitted_for_review_at: createPayload.submitForReview ? new Date() : null,
                eligible_voter_count_snapshot: eligibleVoterCountSnapshot,
                title_en: titleEn,
                title_lang: titleLang,
                text_en: textEn,
                text_lang: textLang,
                summary_en: summary,
                summary_lang: 'en',
            })
            .returning('*');

        await db('audit_log').insert({
            event_type: 'proposal_created_from_template',
            reference_id: proposal.id,
            reference_table: 'proposals',
            actor_id: req.user!.userId,
            hash_onchain: proposalHash,
            details: {
                title: createPayload.title,
                communityId: createPayload.communityId,
                templateId,
            },
        });

        res.status(201).json({
            ...proposal,
            workflow: {
                reviewStatus: proposal.review_status,
                nextAction: proposal.review_status === 'pending_review' ? 'await_review' : 'submit_for_review',
            },
        });
    } catch (err) {
        if (err instanceof z.ZodError) {
            res.status(400).json({ error: 'Validation failed.', details: err.errors });
            return;
        }
        logger.error({ err }, 'Failed to create proposal from template');
        res.status(500).json({ error: 'Failed to create proposal from template.' });
    }
});

// ── GET /api/proposals ──────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
    try {
        await finalizeExpiredProposals();
        await notificationService.safeReminderSweep();

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
                'communities.name_en as community_name_en',
                'communities.name_lang as community_name_lang',
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
                const communityName = await localizeField({
                    english: proposal.community_name_en || proposal.community_name,
                    original: proposal.community_name,
                    originalLocale: proposal.community_name_lang,
                    targetLocale: locale,
                });
                return {
                    ...proposal,
                    title,
                    text,
                    summary,
                    community_name: communityName,
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
        await finalizeExpiredProposals();
        await notificationService.safeReminderSweep();

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
                'communities.name_en as community_name_en',
                'communities.name_lang as community_name_lang',
                'communities.slug as community_slug',
                'users.display_name as author_name',
                'users.id as author_id'
            )
            .where(function () {
                this.whereRaw(
                    "regexp_replace(LOWER(communities.region_code), '[^a-z0-9]', '', 'g') = ?",
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
                const communityName = await localizeField({
                    english: proposal.community_name_en || proposal.community_name,
                    original: proposal.community_name,
                    originalLocale: proposal.community_name_lang,
                    targetLocale: locale,
                });
                return {
                    ...proposal,
                    title,
                    text,
                    summary,
                    community_name: communityName,
                };
            })
        );

        res.json({ proposals: localized });
    } catch (err) {
        logger.error({ err }, 'Failed to fetch eligible proposals');
        res.status(500).json({ error: 'Failed to fetch proposals.' });
    }
});

// ── GET /api/proposals/transparency ────────────────────────────────────────

router.get('/transparency', async (_req: Request, res: Response) => {
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

        const outcomeDetailsRaw = await db('proposals as p')
            .join('communities as c', 'p.community_id', 'c.id')
            .select(
                'p.id',
                'p.title',
                'p.status',
                'p.updated_at',
                'p.finalized_at',
                'c.name as community_name'
            )
            .whereIn('p.status', ['passed', 'failed', 'implemented', 'archived'])
            .orderBy('p.updated_at', 'desc');

        const implementationDetailsRaw = await db('proposal_implementations as pi')
            .join('proposals as p', 'pi.proposal_id', 'p.id')
            .join('communities as c', 'p.community_id', 'c.id')
            .select(
                'pi.id',
                'pi.status',
                'pi.completion_percent',
                'pi.department',
                'pi.target_date',
                'pi.updated_at',
                'pi.proposal_id',
                'p.title as proposal_title',
                'p.status as proposal_status',
                'c.name as community_name'
            )
            .orderBy('pi.updated_at', 'desc');

        const groupedOutcomeDetails = outcomeDetailsRaw.reduce((acc: Record<string, any[]>, row: any) => {
            if (!acc[row.status]) {
                acc[row.status] = [];
            }
            acc[row.status].push(row);
            return acc;
        }, {});

        const groupedImplementationDetails = implementationDetailsRaw.reduce((acc: Record<string, any[]>, row: any) => {
            if (!acc[row.status]) {
                acc[row.status] = [];
            }
            acc[row.status].push(row);
            return acc;
        }, {});

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
            finalOutcomeDetails: groupedOutcomeDetails,
            implementationStatus: implementationByStatus,
            implementationDetails: groupedImplementationDetails,
            onChainVerification: {
                proposalAnchored: parseInt(String(onchainRow?.proposal_tx_count || '0'), 10),
                resultAnchored: parseInt(String(onchainRow?.finalized_hash_count || '0'), 10),
            },
        });
    } catch (err) {
        logger.error({ err }, 'Failed to fetch public transparency metrics');
        res.status(500).json({ error: 'Failed to fetch transparency metrics.' });
    }
});

// ── GET /api/proposals/mine ────────────────────────────────────────────────

router.get('/mine', authMiddleware, async (req: Request, res: Response) => {
    try {
        const locale = normalizeLocale(req.locale);
        const status = req.query.status ? String(req.query.status) : null;
        const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10)));

        let query = db('proposals')
            .join('communities', 'proposals.community_id', 'communities.id')
            .select(
                'proposals.*',
                'communities.name as community_name',
                'communities.name_en as community_name_en',
                'communities.name_lang as community_name_lang',
                'communities.slug as community_slug'
            )
            .where('proposals.created_by', req.user!.userId)
            .orderBy('proposals.created_at', 'desc')
            .limit(limit);

        if (status) {
            query = query.where('proposals.status', status);
        }

        const proposals = await query;

        const localized = await Promise.all(
            proposals.map(async (proposal: any) => ({
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
                community_name: await localizeField({
                    english: proposal.community_name_en || proposal.community_name,
                    original: proposal.community_name,
                    originalLocale: proposal.community_name_lang,
                    targetLocale: locale,
                }),
            }))
        );

        res.json({ proposals: localized });
    } catch (err) {
        logger.error({ err }, 'Failed to fetch user proposals');
        res.status(500).json({ error: 'Failed to fetch user proposals.' });
    }
});

// ── GET /api/proposals/:id ──────────────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response) => {
    try {
        const proposalId = String(req.params.id);
        await finalizeIfExpired(proposalId);

        const locale = normalizeLocale(req.locale);
        const proposal = await db('proposals')
            .join('communities', 'proposals.community_id', 'communities.id')
            .join('users', 'proposals.created_by', 'users.id')
            .select(
                'proposals.*',
                'communities.name as community_name',
                'communities.name_en as community_name_en',
                'communities.name_lang as community_name_lang',
                'communities.slug as community_slug',
                'users.display_name as author_name',
                'users.id as author_id'
            )
            .where('proposals.id', proposalId)
            .first();

        if (!proposal) {
            res.status(404).json({ error: 'Proposal not found.' });
            return;
        }

        const viewerUserId = extractUserIdFromAuthHeader(req.headers.authorization);
        let currentUserVote: 'yes' | 'no' | 'abstain' | null = null;
        if (viewerUserId) {
            const vote = await db('votes')
                .select('choice')
                .where({ proposal_id: proposalId, user_id: viewerUserId })
                .first();
            currentUserVote = (vote?.choice as 'yes' | 'no' | 'abstain' | undefined) || null;
        }

        // Fetch comments
        const comments = await db('comments')
            .join('users', 'comments.user_id', 'users.id')
            .select('comments.*', 'users.display_name as author_name')
            .where({ proposal_id: proposalId, removed: false, auto_hidden: false })
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
            community_name: await localizeField({
                english: proposal.community_name_en || proposal.community_name,
                original: proposal.community_name,
                originalLocale: proposal.community_name_lang,
                targetLocale: locale,
            }),
        };

        const participation = await getParticipationInfo(proposal);

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

        res.json({
            ...localizedProposal,
            comments: localizedComments,
            discussion: {
                for: localizedComments.filter((comment: any) => comment.stance === 'for'),
                against: localizedComments.filter((comment: any) => comment.stance === 'against'),
                neutral: localizedComments.filter((comment: any) => !comment.stance || comment.stance === 'neutral'),
                pinnedExpert: localizedComments.filter((comment: any) => comment.is_pinned_expert),
            },
            votingRules: {
                quorumPercent: participation.quorumPercent,
                minVoterCount: participation.minVoterCount,
            },
            participation: {
                eligibleVoters: participation.eligibleVoters,
                currentVotes: participation.totalVotes,
                rate: participation.participationRate,
                quorumMet: participation.quorumMet,
            },
            currentUserVote,
        });
    } catch (err) {
        logger.error({ err }, 'Failed to fetch proposal');
        res.status(500).json({ error: 'Failed to fetch proposal.' });
    }
});

// ── GET /api/proposals/:id/assistant ───────────────────────────────────────

router.get('/:id/assistant', async (req: Request, res: Response) => {
    try {
        const proposalId = String(req.params.id);
        const locale = normalizeLocale(req.locale);
        const proposal = await db('proposals').where({ id: proposalId }).first();
        if (!proposal) {
            res.status(404).json({ error: 'Proposal not found.' });
            return;
        }

        const comments = await db('comments')
            .where({ proposal_id: proposalId, removed: false })
            .orderBy('created_at', 'desc')
            .limit(50);

        let simpleExplanation = proposal.summary_en || proposal.summary || '';
        let discussionSummary: {
            summary: string;
            keyPros: string[];
            keyCons: string[];
            commentCount: number;
        } | null = null;

        try {
            simpleExplanation = await aiService.explainSimple(
                proposal.title_en || proposal.title,
                proposal.text_en || proposal.text
            );

            discussionSummary = await aiService.summarizeDiscussion(
                proposal.text_en || proposal.text,
                comments.map((comment: any) => comment.body_en || comment.body)
            );
        } catch (aiErr) {
            logger.warn({ err: aiErr, proposalId }, 'AI assistant fallback applied');
        }

        const localizedExplanation = await localizeField({
            english: simpleExplanation,
            original: simpleExplanation,
            originalLocale: 'en',
            targetLocale: locale,
        });

        const localizedDiscussionSummary = discussionSummary
            ? {
                ...discussionSummary,
                summary: await localizeField({
                    english: discussionSummary.summary,
                    original: discussionSummary.summary,
                    originalLocale: 'en',
                    targetLocale: locale,
                }),
                keyPros: await Promise.all(
                    discussionSummary.keyPros.map((item: string) =>
                        localizeField({
                            english: item,
                            original: item,
                            originalLocale: 'en',
                            targetLocale: locale,
                        })
                    )
                ),
                keyCons: await Promise.all(
                    discussionSummary.keyCons.map((item: string) =>
                        localizeField({
                            english: item,
                            original: item,
                            originalLocale: 'en',
                            targetLocale: locale,
                        })
                    )
                ),
            }
            : null;

        res.json({
            proposalId,
            simpleExplanation: localizedExplanation,
            discussionSummary: localizedDiscussionSummary,
            quickAnswer: 'This proposal is intended to solve the stated problem for the listed beneficiaries while balancing cost, timeline, and risk.',
        });
    } catch (err) {
        logger.error({ err }, 'Failed to fetch assistant response');
        res.status(500).json({ error: 'Failed to fetch assistant response.' });
    }
});

// ── GET /api/proposals/:id/similar ─────────────────────────────────────────

router.get('/:id/similar', async (req: Request, res: Response) => {
    try {
        const proposalId = String(req.params.id);
        const limit = Math.min(10, Math.max(1, parseInt(String(req.query.limit || '5'), 10)));

        const proposal = await db('proposals').where({ id: proposalId }).first();
        if (!proposal) {
            res.status(404).json({ error: 'Proposal not found.' });
            return;
        }

        const metadata = await db('proposal_metadata').where({ proposal_id: proposalId }).first();
        const embeddingValue = metadata?.embedding;
        const embedding = Array.isArray(embeddingValue)
            ? embeddingValue
            : (typeof embeddingValue === 'string' ? JSON.parse(embeddingValue) : null);

        if (!embedding) {
            res.json({ proposals: [] });
            return;
        }

        const similar = await aiService.findDuplicates(
            embedding,
            proposal.region_code,
            proposal.category,
            proposalId
        );

        res.json({
            proposals: similar.slice(0, limit),
        });
    } catch (err) {
        logger.error({ err }, 'Failed to fetch similar proposals');
        res.status(500).json({ error: 'Failed to fetch similar proposals.' });
    }
});

// ── GET /api/proposals/:id/discussion-summary ──────────────────────────────

router.get('/:id/discussion-summary', async (req: Request, res: Response) => {
    try {
        const proposalId = String(req.params.id);
        const proposal = await db('proposals').where({ id: proposalId }).first();
        if (!proposal) {
            res.status(404).json({ error: 'Proposal not found.' });
            return;
        }

        const comments = await db('comments')
            .where({ proposal_id: proposalId, removed: false })
            .orderBy('created_at', 'desc')
            .limit(100);

        try {
            const summary = await aiService.summarizeDiscussion(
                proposal.text_en || proposal.text,
                comments.map((comment: any) => comment.body_en || comment.body)
            );
            res.json(summary);
            return;
        } catch (aiErr) {
            logger.warn({ err: aiErr }, 'AI discussion summary unavailable, returning fallback');
        }

        res.json({
            summary: proposal.summary_en || proposal.summary || 'Discussion summary unavailable.',
            keyPros: [],
            keyCons: [],
            commentCount: comments.length,
        });
    } catch (err) {
        logger.error({ err }, 'Failed to fetch discussion summary');
        res.status(500).json({ error: 'Failed to fetch discussion summary.' });
    }
});

// ── GET /api/proposals/:id/on-chain-status ─────────────────────────────────

router.get('/:id/on-chain-status', async (req: Request, res: Response) => {
    try {
        const proposalId = String(req.params.id);
        const proposal = await db('proposals').where({ id: proposalId }).first();
        if (!proposal) {
            res.status(404).json({ error: 'Proposal not found.' });
            return;
        }

        const proposalVerified = proposal.proposal_hash
            ? await relayerService.verifyProposalHash(proposalId, proposal.proposal_hash)
            : false;

        const resultVerified = proposal.result_hash
            ? await relayerService.verifyResultHash(proposalId, proposal.result_hash)
            : false;

        res.json({
            proposalId,
            proposalHash: proposal.proposal_hash,
            resultHash: proposal.result_hash,
            txHash: proposal.tx_hash,
            proposalVerified,
            resultVerified,
            hasAnyOnChainRecord: Boolean(proposal.tx_hash || proposal.result_hash || proposal.proposal_hash),
        });
    } catch (err) {
        logger.error({ err }, 'Failed to fetch on-chain status');
        res.status(500).json({ error: 'Failed to fetch on-chain status.' });
    }
});

// ── POST /api/proposals ─────────────────────────────────────────────────────

router.post('/', authMiddleware, async (req: Request, res: Response) => {
    try {
        const body = createProposalSchema.parse(req.body);
        const attachmentsProof = parseAttachmentProof(body.attachmentsProof);

        if (attachmentsProof.length === 0) {
            res.status(400).json({ error: 'At least one attachment or proof URL is required.' });
            return;
        }

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

        const titleLang = await detectLocale(body.title);
        const textLang = await detectLocale(body.text);
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
            await createFraudAlert({
                alertType: 'spam_proposal_duplicate',
                severity: 'medium',
                referenceTable: 'communities',
                referenceId: body.communityId,
                actorId: req.user!.userId,
                summary: 'Proposal creation blocked due to high-similarity duplicates.',
                details: {
                    category: body.category,
                    regionCode: community.region_code,
                    duplicateCount: duplicates.length,
                    duplicates: duplicates.map((d: any) => ({ id: d.id, similarity: d.similarity })),
                },
            });

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

        let riskResult: { riskScore: number; flags: string[]; recommendation: string } | null = null;
        try {
            riskResult = await aiService.analyzeRisk(`${body.title}\n\n${body.text}`);
        } catch (riskErr) {
            logger.warn({ err: riskErr }, 'AI risk analysis unavailable for proposal');
        }

        if (riskResult && riskResult.recommendation !== 'none') {
            await createFraudAlert({
                alertType: 'proposal_risk_signal',
                severity: riskResult.recommendation === 'hide_and_review' ? 'high' : 'medium',
                referenceTable: 'communities',
                referenceId: body.communityId,
                actorId: req.user!.userId,
                summary: 'Proposal content flagged by AI risk analysis.',
                details: {
                    riskScore: riskResult.riskScore,
                    flags: riskResult.flags,
                    recommendation: riskResult.recommendation,
                },
            });
        }

        const deadline = new Date();
        deadline.setDate(deadline.getDate() + body.deadlineDays);

        const [eligibleSnapshotRow] = await db('community_members')
            .where({ community_id: body.communityId })
            .where((qb) => {
                qb.where('status', 'approved').orWhereNull('status');
            })
            .count('* as count');
        const eligibleVoterCountSnapshot = parseInt(String(eligibleSnapshotRow?.count || '0'), 10);

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
                status: 'draft',
                deadline,
                summary,
                proposal_hash: proposalHash,
                created_by: req.user!.userId,
                region_code: community.region_code,
                problem_statement: body.problemStatement,
                beneficiaries: body.beneficiaries,
                timeline: body.timeline,
                budget_estimate: body.expectedCost,
                impact_summary: body.impactSummary,
                risk_analysis: body.riskAnalysis,
                attachments_proof: JSON.stringify(attachmentsProof),
                review_status:
                    riskResult?.recommendation === 'hide_and_review'
                        ? 'pending_review'
                        : (body.submitForReview ? 'pending_review' : 'draft'),
                submitted_for_review_at:
                    riskResult?.recommendation === 'hide_and_review' || body.submitForReview
                        ? new Date()
                        : null,
                eligible_voter_count_snapshot: eligibleVoterCountSnapshot,
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
            details: {
                title: body.title,
                communityId: body.communityId,
                risk: riskResult,
            },
        });

        await notificationService.notifyProposalCreated({
            proposalId: proposal.id,
            communityId: community.id,
            communityName: community.name,
            category: body.category,
            deadline: deadline.toISOString(),
            title: body.title,
            actorId: req.user!.userId,
        });

        res.status(201).json({
            ...proposal,
            workflow: {
                reviewStatus: proposal.review_status,
                nextAction: proposal.review_status === 'pending_review' ? 'await_review' : 'submit_for_review',
            },
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

// ── POST /api/proposals/:id/submit-review ──────────────────────────────────

router.post('/:id/submit-review', authMiddleware, async (req: Request, res: Response) => {
    try {
        const proposalId = String(req.params.id);
        const proposal = await db('proposals').where({ id: proposalId }).first();
        if (!proposal) {
            res.status(404).json({ error: 'Proposal not found.' });
            return;
        }

        if (proposal.created_by !== req.user!.userId) {
            res.status(403).json({ error: 'Only the proposal creator can submit for review.' });
            return;
        }

        if (proposal.review_status !== 'draft' && proposal.review_status !== 'changes_requested') {
            res.status(400).json({ error: 'Proposal is not eligible for review submission.' });
            return;
        }

        await db('proposals').where({ id: proposalId }).update({
            review_status: 'pending_review',
            submitted_for_review_at: new Date(),
            reviewed_by: null,
            reviewed_at: null,
            updated_at: new Date(),
        });

        await db('audit_log').insert({
            event_type: 'proposal_submitted_for_review',
            reference_id: proposalId,
            reference_table: 'proposals',
            actor_id: req.user!.userId,
            details: { previousStatus: proposal.review_status },
        });

        res.json({ message: 'Proposal submitted for review.' });
    } catch (err) {
        logger.error({ err }, 'Failed to submit proposal for review');
        res.status(500).json({ error: 'Failed to submit for review.' });
    }
});

// ── POST /api/proposals/:id/publish ───────────────────────────────────────

router.post('/:id/publish', authMiddleware, async (req: Request, res: Response) => {
    try {
        const proposalId = String(req.params.id);
        const proposal = await db('proposals').where({ id: proposalId }).first();
        if (!proposal) {
            res.status(404).json({ error: 'Proposal not found.' });
            return;
        }

        const canReview = await canReviewProposal(proposal, req.user!.userId, req.user!.role);
        const isCreator = proposal.created_by === req.user!.userId;
        if (!isCreator && !canReview) {
            res.status(403).json({ error: 'Only the proposal creator, moderator, or admin can publish this draft.' });
            return;
        }

        if (proposal.status === 'voting') {
            res.json({
                message: 'Proposal is already live for voting.',
                proposalId,
                status: proposal.status,
                reviewStatus: proposal.review_status,
            });
            return;
        }

        await db('proposals').where({ id: proposalId }).update({
            status: 'voting',
            review_status: 'approved',
            reviewed_by: canReview ? req.user!.userId : proposal.reviewed_by,
            reviewed_at: canReview ? new Date() : proposal.reviewed_at,
            published_at: new Date(),
            updated_at: new Date(),
        });

        await db('audit_log').insert({
            event_type: 'proposal_published',
            reference_id: proposalId,
            reference_table: 'proposals',
            actor_id: req.user!.userId,
            details: {
                previousStatus: proposal.status,
                previousReviewStatus: proposal.review_status,
            },
        });

        res.json({
            message: 'Proposal is now live for voting.',
            proposalId,
            status: 'voting',
            reviewStatus: 'approved',
        });
    } catch (err) {
        logger.error({ err }, 'Failed to publish proposal');
        res.status(500).json({ error: 'Failed to publish proposal.' });
    }
});

// ── DELETE /api/proposals/:id/draft ───────────────────────────────────────

router.delete('/:id/draft', authMiddleware, async (req: Request, res: Response) => {
    try {
        const proposalId = String(req.params.id);
        const proposal = await db('proposals').where({ id: proposalId }).first();
        if (!proposal) {
            res.status(404).json({ error: 'Proposal not found.' });
            return;
        }

        const canReview = await canReviewProposal(proposal, req.user!.userId, req.user!.role);
        const isCreator = proposal.created_by === req.user!.userId;
        if (!isCreator && !canReview) {
            res.status(403).json({ error: 'Only the proposal creator, moderator, or admin can delete this draft.' });
            return;
        }

        const canDeleteDraft =
            proposal.status === 'draft' || ['draft', 'changes_requested', 'pending_review'].includes(proposal.review_status || 'draft');

        if (!canDeleteDraft || proposal.status === 'voting') {
            res.status(400).json({ error: 'Only draft proposals can be deleted.' });
            return;
        }

        await db.transaction(async (trx) => {
            const implementation = await trx('proposal_implementations')
                .select('id')
                .where({ proposal_id: proposalId })
                .first();

            if (implementation) {
                await trx('implementation_milestones').where({ implementation_id: implementation.id }).del();
                await trx('implementation_updates').where({ implementation_id: implementation.id }).del();
                await trx('implementation_budget_releases').where({ implementation_id: implementation.id }).del();
                await trx('implementation_proof_files').where({ implementation_id: implementation.id }).del();
                await trx('proposal_implementations').where({ proposal_id: proposalId }).del();
            }

            await trx('votes').where({ proposal_id: proposalId }).del();
            await trx('comments').where({ proposal_id: proposalId }).del();
            await trx('proposal_metadata').where({ proposal_id: proposalId }).del();
            await trx('proposal_watchers').where({ proposal_id: proposalId }).del();
            await trx('notifications').where({ entity_type: 'proposal', entity_id: proposalId }).del();
            await trx('personalized_feed_items').where({ entity_type: 'proposal', entity_id: proposalId }).del();
            await trx('admin_actions').where({ proposal_id: proposalId }).del();
            await trx('audit_log').where({ reference_table: 'proposals', reference_id: proposalId }).del();
            await trx('proposals').where({ id: proposalId }).del();
        });

        res.json({ message: 'Draft deleted.', proposalId });
    } catch (err) {
        logger.error({ err }, 'Failed to delete draft proposal');
        res.status(500).json({ error: 'Failed to delete draft proposal.' });
    }
});

// ── POST /api/proposals/:id/review ─────────────────────────────────────────

router.post('/:id/review', authMiddleware, async (req: Request, res: Response) => {
    try {
        const body = reviewActionSchema.parse(req.body);
        const proposalId = String(req.params.id);
        const proposal = await db('proposals').where({ id: proposalId }).first();
        if (!proposal) {
            res.status(404).json({ error: 'Proposal not found.' });
            return;
        }

        if (proposal.review_status !== 'pending_review') {
            res.status(400).json({ error: 'Proposal is not pending review.' });
            return;
        }

        const authorized = await canReviewProposal(proposal, req.user!.userId, req.user!.role);
        if (!authorized) {
            res.status(403).json({ error: 'Only community owner or moderator can review.' });
            return;
        }

        const approved = body.action === 'approve';
        const nextReviewStatus = approved ? 'approved' : 'changes_requested';
        const nextProposalStatus = approved ? 'voting' : 'draft';

        await db('proposals').where({ id: proposalId }).update({
            review_status: nextReviewStatus,
            status: nextProposalStatus,
            review_notes: body.notes || null,
            reviewed_by: req.user!.userId,
            reviewed_at: new Date(),
            published_at: approved ? new Date() : null,
            updated_at: new Date(),
        });

        await db('audit_log').insert({
            event_type: approved ? 'proposal_review_approved' : 'proposal_review_changes_requested',
            reference_id: proposalId,
            reference_table: 'proposals',
            actor_id: req.user!.userId,
            details: { notes: body.notes || null },
        });

        res.json({
            message: approved ? 'Proposal approved and published for voting.' : 'Changes requested sent to creator.',
            proposalId,
            reviewStatus: nextReviewStatus,
            status: nextProposalStatus,
        });
    } catch (err) {
        if (err instanceof z.ZodError) {
            res.status(400).json({ error: 'Validation failed.', details: err.errors });
            return;
        }
        logger.error({ err }, 'Failed to review proposal');
        res.status(500).json({ error: 'Failed to review proposal.' });
    }
});

// ── POST /api/proposals/:id/vote ────────────────────────────────────────────

router.post('/:id/vote', authMiddleware, async (req: Request, res: Response) => {
    try {
        const body = voteSchema.parse(req.body);
        const proposalId = String(req.params.id);

        await finalizeIfExpired(proposalId);

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
            .select('yes_count', 'no_count', 'abstain_count', 'community_id')
            .first();

        const participation = await getParticipationInfo(updated);

        const voteRisk = await analyzeVoteRiskSignals(proposalId);
        if (voteRisk.reasons.length > 0) {
            await db('audit_log').insert({
                event_type: 'vote_risk_signal',
                reference_id: proposalId,
                reference_table: 'proposals',
                actor_id: req.user!.userId,
                details: {
                    reasons: voteRisk.reasons,
                    suspiciousSpike: voteRisk.suspiciousSpike,
                    potentialBrigading: voteRisk.potentialBrigading,
                    duplicateAccountPattern: voteRisk.duplicateAccountPattern,
                },
            });

            const admins = await db('users')
                .select('id')
                .whereIn('role', ['admin', 'superadmin'])
                .whereRaw("regexp_replace(LOWER(region_code), '[^a-z0-9]', '', 'g') = ?", [
                    normalizeRegionCode(proposal.region_code),
                ]);

            await Promise.all(
                admins.map((admin: any) =>
                    notificationService.createInApp({
                        userId: admin.id,
                        actorId: req.user!.userId,
                        type: 'status_update',
                        title: 'Suspicious voting pattern detected',
                        body: `Proposal ${proposal.title_en || proposal.title} triggered: ${voteRisk.reasons.join(', ')}`,
                        entityType: 'proposal',
                        entityId: proposalId,
                        metadata: {
                            reasons: voteRisk.reasons,
                        },
                    })
                )
            );

            await createFraudAlert({
                alertType: 'vote_brigading_signal',
                severity: voteRisk.potentialBrigading || voteRisk.duplicateAccountPattern ? 'high' : 'medium',
                referenceTable: 'proposals',
                referenceId: proposalId,
                actorId: req.user!.userId,
                summary: 'Suspicious vote behavior detected by heuristics.',
                details: {
                    reasons: voteRisk.reasons,
                    suspiciousSpike: voteRisk.suspiciousSpike,
                    potentialBrigading: voteRisk.potentialBrigading,
                    duplicateAccountPattern: voteRisk.duplicateAccountPattern,
                },
            });
        }

        await notificationService
            .notifyVoteConfirmation({
                userId: req.user!.userId,
                proposalId,
                proposalTitle: proposal.title_en || proposal.title,
                choice: body.choice,
            })
            .catch(() => undefined);

        res.json({
            message: existingVote ? 'Vote updated.' : 'Vote recorded.',
            choice: body.choice,
            counts: {
                yes: updated.yes_count,
                no: updated.no_count,
                abstain: updated.abstain_count,
            },
            quorum_status: participation.quorumMet ? 'met' : 'not_met',
            current_participation: participation.participationRate,
            min_required_participation: participation.quorumPercent,
            min_required_voters: participation.minVoterCount,
            risk_signals: voteRisk.reasons,
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
        const proposalId = String(req.params.id);

        await finalizeIfExpired(proposalId);

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
        const { body: commentBody, parentId, stance = 'neutral' } = req.body;

        if (!commentBody || typeof commentBody !== 'string' || commentBody.length < 2) {
            res.status(400).json({ error: 'Comment body is required (min 2 characters).' });
            return;
        }

        const proposalId = String(req.params.id);
        await finalizeIfExpired(proposalId);

        const proposal = await db('proposals').where({ id: proposalId }).first();
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

        const bodyLang = await detectLocale(commentBody);
        const bodyEn = bodyLang === 'en' ? commentBody : await translateText(commentBody, bodyLang, 'en');
        const sentiment = detectSentiment(bodyEn);
        const cluster = detectCluster(bodyEn);
        const abuse = detectAbuseSignals(commentBody);

        let aiRisk: { riskScore: number; flags: string[]; recommendation: string } | null = null;
        try {
            aiRisk = await aiService.analyzeRisk(commentBody);
        } catch (riskErr) {
            logger.warn({ err: riskErr }, 'AI risk analysis unavailable for comment');
        }

        const mergedFlags = Array.from(new Set([
            ...abuse.flags,
            ...(aiRisk?.flags || []),
        ]));
        const autoHide = abuse.autoHide || aiRisk?.recommendation === 'hide_and_review';

        const [comment] = await db('comments')
            .insert({
                proposal_id: proposalId,
                user_id: req.user!.userId,
                parent_id: parentId || null,
                body: commentBody,
                body_en: bodyEn,
                body_lang: bodyLang,
                stance,
                sentiment_label: sentiment.label,
                sentiment_confidence: sentiment.confidence,
                cluster_label: cluster,
                flagged: mergedFlags.length > 0,
                auto_hidden: autoHide,
                moderation_reason: mergedFlags.length > 0 ? mergedFlags.join(',') : null,
                ai_flags: mergedFlags.length > 0 ? JSON.stringify({
                    flags: mergedFlags,
                    riskScore: aiRisk?.riskScore ?? null,
                    recommendation: aiRisk?.recommendation ?? null,
                }) : null,
            })
            .returning('*');

        const author = await db('users')
            .select('display_name')
            .where({ id: req.user!.userId })
            .first();

        const localizedBody = await localizeField({
            english: comment.body_en || comment.body,
            original: comment.body,
            originalLocale: comment.body_lang,
            targetLocale: normalizeLocale(req.locale),
        });

        res.status(201).json({
            ...comment,
            body: localizedBody,
            author_name: author?.display_name || 'User',
        });

        await db('audit_log').insert({
            event_type: autoHide ? 'comment_auto_hidden' : 'comment_created',
            reference_id: comment.id,
            reference_table: 'comments',
            actor_id: req.user!.userId,
            details: {
                proposalId,
                stance,
                flags: mergedFlags,
                risk: aiRisk,
            },
        });
    } catch (err) {
        logger.error({ err }, 'Failed to add comment');
        res.status(500).json({ error: 'Failed to add comment.' });
    }
});

// ── POST /api/proposals/:id/comments/:commentId/pin-expert ────────────────

router.post('/:id/comments/:commentId/pin-expert', authMiddleware, async (req: Request, res: Response) => {
    try {
        const proposalId = String(req.params.id);
        const commentId = String(req.params.commentId);

        const proposal = await db('proposals').where({ id: proposalId }).first();
        if (!proposal) {
            res.status(404).json({ error: 'Proposal not found.' });
            return;
        }

        const authorized = await canReviewProposal(proposal, req.user!.userId, req.user!.role);
        if (!authorized) {
            res.status(403).json({ error: 'Only community owner, moderator, or admin can pin expert responses.' });
            return;
        }

        const updated = await db('comments')
            .where({ id: commentId, proposal_id: proposalId })
            .update({
                is_pinned_expert: true,
                updated_at: new Date(),
            });

        if (!updated) {
            res.status(404).json({ error: 'Comment not found.' });
            return;
        }

        await db('audit_log').insert({
            event_type: 'comment_pinned_expert',
            reference_id: commentId,
            reference_table: 'comments',
            actor_id: req.user!.userId,
            details: { proposalId },
        });

        res.json({ message: 'Comment pinned as expert response.' });
    } catch (err) {
        logger.error({ err }, 'Failed to pin expert comment');
        res.status(500).json({ error: 'Failed to pin expert comment.' });
    }
});

// ── POST /api/proposals/:id/extend-deadline ────────────────────────────────

router.post('/:id/extend-deadline', authMiddleware, async (req: Request, res: Response) => {
    try {
        const body = extendDeadlineSchema.parse(req.body);
        const proposalId = String(req.params.id);

        await finalizeIfExpired(proposalId);

        const proposal = await db('proposals').where({ id: proposalId }).first();
        if (!proposal) {
            res.status(404).json({ error: 'Proposal not found.' });
            return;
        }

        if (proposal.status !== 'voting') {
            res.status(400).json({ error: 'Only voting proposals can be extended.' });
            return;
        }

        const isCreator = proposal.created_by === req.user!.userId;
        const isAdmin = req.user!.role === 'admin' || req.user!.role === 'superadmin';
        if (!isCreator && !isAdmin) {
            res.status(403).json({ error: 'Only the proposal creator or admin can extend deadline.' });
            return;
        }

        const currentDeadline = proposal.deadline ? new Date(proposal.deadline) : new Date();
        const newDeadline = new Date(currentDeadline);
        newDeadline.setDate(newDeadline.getDate() + body.days);

        await db('proposals').where({ id: proposalId }).update({
            deadline: newDeadline,
            updated_at: new Date(),
        });

        if (isAdmin) {
            await db('admin_actions').insert({
                admin_id: req.user!.userId,
                proposal_id: proposalId,
                action_type: 'extend_deadline',
                description: body.reason || `Extended voting deadline by ${body.days} day(s).`,
            });
        }

        await db('audit_log').insert({
            event_type: 'proposal_deadline_extended',
            reference_id: proposalId,
            reference_table: 'proposals',
            actor_id: req.user!.userId,
            details: {
                daysExtended: body.days,
                oldDeadline: proposal.deadline,
                newDeadline,
                reason: body.reason || null,
                extendedByRole: req.user!.role,
            },
        });

        res.json({
            message: `Voting deadline extended by ${body.days} day(s).`,
            proposalId,
            deadline: newDeadline,
        });
    } catch (err) {
        if (err instanceof z.ZodError) {
            res.status(400).json({ error: 'Validation failed.', details: err.errors });
            return;
        }
        logger.error({ err }, 'Failed to extend proposal deadline');
        res.status(500).json({ error: 'Failed to extend proposal deadline.' });
    }
});

export default router;
