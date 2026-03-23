import crypto from 'crypto';
import db from '../db';
import logger from '../logger';
import { relayerService } from './relayer';
import { notificationService } from './notifications';

type ProposalForFinalize = {
    id: string;
    status: string;
    deadline: string | Date | null;
    yes_count: number;
    no_count: number;
    abstain_count: number;
    community_id?: string;
    title?: string;
    title_en?: string;
};

type FinalizeOptions = {
    actorId?: string;
    eventType: string;
    reason: string;
    addAdminAction: boolean;
};

const computeFinalStatus = (proposal: ProposalForFinalize): 'passed' | 'failed' => {
    const totalVotes = proposal.yes_count + proposal.no_count + proposal.abstain_count;
    const passed = totalVotes > 0 && proposal.yes_count / totalVotes > 0.51;
    return passed ? 'passed' : 'failed';
};

const isExpired = (deadline: string | Date | null): boolean => {
    if (!deadline) {
        return false;
    }
    return new Date(deadline) < new Date();
};

const finalizeProposal = async (
    proposal: ProposalForFinalize,
    options: FinalizeOptions
): Promise<{ finalized: boolean; status: 'passed' | 'failed'; resultHash: string; txHash: string | null }> => {
    const status = computeFinalStatus(proposal);

    const resultData = JSON.stringify({
        proposalId: proposal.id,
        yesCount: proposal.yes_count,
        noCount: proposal.no_count,
        abstainCount: proposal.abstain_count,
        status,
        finalizedBy: options.actorId || 'system',
        finalizedAt: new Date().toISOString(),
        reason: options.reason,
    });
    const resultHash = '0x' + crypto.createHash('sha256').update(resultData).digest('hex');

    const updated = await db('proposals')
        .where({ id: proposal.id })
        .whereIn('status', ['voting', 'active'])
        .update({
            status,
            result_hash: resultHash,
            finalized_at: new Date(),
            updated_at: new Date(),
        });

    if (!updated) {
        return { finalized: false, status, resultHash, txHash: null };
    }

    if (options.addAdminAction && options.actorId) {
        await db('admin_actions').insert({
            admin_id: options.actorId,
            proposal_id: proposal.id,
            action_type: 'finalize_vote',
            description: `Proposal ${status}. Yes: ${proposal.yes_count}, No: ${proposal.no_count}, Abstain: ${proposal.abstain_count}.`,
            status_hash: resultHash,
        });
    }

    let txHash: string | null = null;
    try {
        txHash = await relayerService.finalizeVote(proposal.id, resultHash);
        if (txHash) {
            await db('proposals').where({ id: proposal.id }).update({ tx_hash: txHash });
        }
    } catch (relayErr) {
        logger.error({ err: relayErr, proposalId: proposal.id }, 'Relayer failed to finalize on-chain');
    }

    await db('audit_log').insert({
        event_type: options.eventType,
        reference_id: proposal.id,
        reference_table: 'proposals',
        actor_id: options.actorId || null,
        hash_onchain: resultHash,
        tx_hash: txHash,
        details: {
            result: status,
            reason: options.reason,
            yesCount: proposal.yes_count,
            noCount: proposal.no_count,
            abstainCount: proposal.abstain_count,
        },
    });

    if (proposal.community_id) {
        await notificationService
            .notifyVoteOutcome({
                proposalId: proposal.id,
                title: proposal.title_en || proposal.title || 'Proposal',
                status,
                communityId: proposal.community_id,
            })
            .catch(() => undefined);
    }

    return { finalized: true, status, resultHash, txHash };
};

export const finalizeExpiredProposals = async (limit = 50): Promise<number> => {
    const candidates = await db('proposals')
        .select(
            'id',
            'status',
            'deadline',
            'yes_count',
            'no_count',
            'abstain_count',
            'community_id',
            'title',
            'title_en'
        )
        .where('status', 'voting')
        .whereNotNull('deadline')
        .where('deadline', '<', db.fn.now())
        .orderBy('deadline', 'asc')
        .limit(limit);

    let finalizedCount = 0;
    for (const proposal of candidates as ProposalForFinalize[]) {
        const result = await finalizeProposal(proposal, {
            eventType: 'vote_auto_finalized',
            reason: 'deadline_reached',
            addAdminAction: false,
        });
        if (result.finalized) {
            finalizedCount += 1;
        }
    }

    return finalizedCount;
};

export const finalizeIfExpired = async (proposalId: string): Promise<boolean> => {
    const proposal = await db('proposals')
        .select(
            'id',
            'status',
            'deadline',
            'yes_count',
            'no_count',
            'abstain_count',
            'community_id',
            'title',
            'title_en'
        )
        .where({ id: proposalId })
        .first();

    if (!proposal || proposal.status !== 'voting' || !isExpired(proposal.deadline)) {
        return false;
    }

    const result = await finalizeProposal(proposal as ProposalForFinalize, {
        eventType: 'vote_auto_finalized',
        reason: 'deadline_reached',
        addAdminAction: false,
    });
    return result.finalized;
};

export const finalizeForAdmin = async (
    proposal: ProposalForFinalize,
    adminId: string
): Promise<{ status: 'passed' | 'failed'; resultHash: string; txHash: string | null }> => {
    const result = await finalizeProposal(proposal, {
        actorId: adminId,
        eventType: 'vote_finalized',
        reason: 'manual_admin_finalization',
        addAdminAction: true,
    });

    return {
        status: result.status,
        resultHash: result.resultHash,
        txHash: result.txHash,
    };
};
