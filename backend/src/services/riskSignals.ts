import db from '../db';

export type VoteRiskSignals = {
    suspiciousSpike: boolean;
    potentialBrigading: boolean;
    duplicateAccountPattern: boolean;
    reasons: string[];
};

const RECENT_WINDOW_MINUTES = 10;
const SPIKE_THRESHOLD = 25;
const NEW_ACCOUNT_WINDOW_HOURS = 48;
const NEW_ACCOUNT_THRESHOLD = 10;

export const analyzeVoteRiskSignals = async (proposalId: string): Promise<VoteRiskSignals> => {
    const reasons: string[] = [];

    const recentVotes = await db('votes')
        .where({ proposal_id: proposalId })
        .andWhere('created_at', '>=', db.raw(`NOW() - INTERVAL '${RECENT_WINDOW_MINUTES} minutes'`));

    const suspiciousSpike = recentVotes.length >= SPIKE_THRESHOLD;
    if (suspiciousSpike) {
        reasons.push('vote_spike_detected');
    }

    const votesBySecond = new Map<string, number>();
    for (const vote of recentVotes as any[]) {
        const key = new Date(vote.created_at).toISOString().slice(0, 19);
        votesBySecond.set(key, (votesBySecond.get(key) || 0) + 1);
    }

    const maxBurst = Math.max(0, ...Array.from(votesBySecond.values()));
    const potentialBrigading = maxBurst >= 8;
    if (potentialBrigading) {
        reasons.push('coordinated_vote_burst');
    }

    const newAccountVotes = await db('votes as v')
        .join('users as u', 'u.id', 'v.user_id')
        .where('v.proposal_id', proposalId)
        .andWhere('v.created_at', '>=', db.raw(`NOW() - INTERVAL '${RECENT_WINDOW_MINUTES} minutes'`))
        .andWhere('u.created_at', '>=', db.raw(`NOW() - INTERVAL '${NEW_ACCOUNT_WINDOW_HOURS} hours'`))
        .count('* as count')
        .first();

    const duplicateAccountPattern = parseInt(String(newAccountVotes?.count || '0'), 10) >= NEW_ACCOUNT_THRESHOLD;
    if (duplicateAccountPattern) {
        reasons.push('new_account_vote_cluster');
    }

    return {
        suspiciousSpike,
        potentialBrigading,
        duplicateAccountPattern,
        reasons,
    };
};
