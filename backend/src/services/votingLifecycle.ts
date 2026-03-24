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
    proposal_hash?: string | null;
    eligible_voter_count_snapshot?: number | null;
};

type FinalizeOptions = {
    actorId?: string;
    eventType: string;
    reason: string;
    addAdminAction: boolean;
};

const computeFinalStatus = async (proposal: ProposalForFinalize): Promise<{
    status: 'passed' | 'failed';
    totalVotes: number;
    eligibleVoters: number;
    participationRate: number;
    quorumPercent: number;
    minVoterCount: number;
    quorumMet: boolean;
}> => {
    const totalVotes = proposal.yes_count + proposal.no_count + proposal.abstain_count;

    const settings = await db('community_governance_settings')
        .where({ community_id: proposal.community_id, enabled: true })
        .first();

    const quorumPercent = Number(settings?.quorum_percent ?? 20);
    const minVoterCount = Number(settings?.min_voter_count ?? 10);

    let eligibleVoters = Number(proposal.eligible_voter_count_snapshot || 0);
    if (!eligibleVoters && proposal.community_id) {
        const [row] = await db('community_members')
            .where({ community_id: proposal.community_id })
            .where((qb) => {
                qb.where('status', 'approved').orWhereNull('status');
            })
            .count('* as count');
        eligibleVoters = parseInt(String(row?.count || '0'), 10);
    }

    const participationRate = eligibleVoters > 0 ? (totalVotes / eligibleVoters) * 100 : 0;
    const quorumMet = totalVotes >= minVoterCount && participationRate >= quorumPercent;

    const passed = quorumMet && totalVotes > 0 && proposal.yes_count / totalVotes > 0.51;

    return {
        status: passed ? 'passed' : 'failed',
        totalVotes,
        eligibleVoters,
        participationRate,
        quorumPercent,
        minVoterCount,
        quorumMet,
    };
};

const isExpired = (deadline: string | Date | null): boolean => {
    if (!deadline) {
        return false;
    }
    return new Date(deadline) < new Date();
};

const isProposalNotRegisteredError = (err: unknown): boolean => {
    const message = err instanceof Error ? err.message : String(err || '');
    return message.toLowerCase().includes('proposal not registered');
};

const finalizeProposal = async (
    proposal: ProposalForFinalize,
    options: FinalizeOptions
): Promise<{ finalized: boolean; status: 'passed' | 'failed'; resultHash: string; txHash: string | null }> => {
    const outcome = await computeFinalStatus(proposal);
    const status = outcome.status;

    const resultData = JSON.stringify({
        proposalId: proposal.id,
        yesCount: proposal.yes_count,
        noCount: proposal.no_count,
        abstainCount: proposal.abstain_count,
        totalVotes: outcome.totalVotes,
        eligibleVoters: outcome.eligibleVoters,
        participationRate: outcome.participationRate,
        quorumPercent: outcome.quorumPercent,
        minVoterCount: outcome.minVoterCount,
        quorumMet: outcome.quorumMet,
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
            eligible_voter_count_snapshot: outcome.eligibleVoters,
            participation_rate: outcome.participationRate,
            quorum_met: outcome.quorumMet,
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
        if (isProposalNotRegisteredError(relayErr) && proposal.proposal_hash) {
            try {
                await relayerService.registerProposal(proposal.proposal_hash, proposal.id, 0);
                txHash = await relayerService.finalizeVote(proposal.id, resultHash);
                if (txHash) {
                    await db('proposals').where({ id: proposal.id }).update({ tx_hash: txHash });
                }
            } catch (retryErr) {
                logger.error(
                    { err: retryErr, proposalId: proposal.id },
                    'Relayer retry failed after auto-register attempt'
                );
            }
        } else {
            logger.error({ err: relayErr, proposalId: proposal.id }, 'Relayer failed to finalize on-chain');
        }
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
            totalVotes: outcome.totalVotes,
            eligibleVoters: outcome.eligibleVoters,
            participationRate: outcome.participationRate,
            quorumPercent: outcome.quorumPercent,
            minVoterCount: outcome.minVoterCount,
            quorumMet: outcome.quorumMet,
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
            'proposal_hash',
            'yes_count',
            'no_count',
            'abstain_count',
            'community_id',
            'title',
            'title_en',
            'eligible_voter_count_snapshot'
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
            'proposal_hash',
            'yes_count',
            'no_count',
            'abstain_count',
            'community_id',
            'title',
            'title_en',
            'eligible_voter_count_snapshot'
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
