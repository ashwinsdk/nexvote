import db from '../db';
import { analyzeVoteRiskSignals } from './riskSignals';

jest.mock('../db', () => {
    const mockDb: any = jest.fn();
    mockDb.raw = jest.fn((sql: string) => sql);
    return {
        __esModule: true,
        default: mockDb,
    };
});

type ThenableBuilder<T> = {
    where: jest.Mock;
    andWhere: jest.Mock;
    join: jest.Mock;
    count: jest.Mock;
    first: jest.Mock;
    then: (resolve: (value: T) => unknown, reject?: (error: unknown) => unknown) => Promise<unknown>;
};

const makeVotesBuilder = (rows: any[]): ThenableBuilder<any[]> => {
    const builder: Partial<ThenableBuilder<any[]>> = {};
    builder.where = jest.fn(() => builder as ThenableBuilder<any[]>);
    builder.andWhere = jest.fn(() => builder as ThenableBuilder<any[]>);
    builder.join = jest.fn(() => builder as ThenableBuilder<any[]>);
    builder.count = jest.fn(() => builder as ThenableBuilder<any[]>);
    builder.first = jest.fn(async () => ({ count: '0' }));
    builder.then = (resolve, reject) => Promise.resolve(rows).then(resolve, reject);
    return builder as ThenableBuilder<any[]>;
};

const makeCountBuilder = (countValue: string): ThenableBuilder<any> => {
    const builder: Partial<ThenableBuilder<any>> = {};
    builder.where = jest.fn(() => builder as ThenableBuilder<any>);
    builder.andWhere = jest.fn(() => builder as ThenableBuilder<any>);
    builder.join = jest.fn(() => builder as ThenableBuilder<any>);
    builder.count = jest.fn(() => builder as ThenableBuilder<any>);
    builder.first = jest.fn(async () => ({ count: countValue }));
    builder.then = (resolve, reject) => Promise.resolve({ count: countValue }).then(resolve, reject);
    return builder as ThenableBuilder<any>;
};

describe('analyzeVoteRiskSignals', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('detects spike, brigading burst and new-account cluster', async () => {
        const votes = Array.from({ length: 25 }, (_, idx) => ({
            created_at: idx < 8 ? '2026-03-23T12:00:10.000Z' : `2026-03-23T12:00:${(idx + 10).toString().padStart(2, '0')}.000Z`,
        }));

        const dbMock = db as unknown as jest.Mock;
        dbMock
            .mockImplementationOnce(() => makeVotesBuilder(votes))
            .mockImplementationOnce(() => makeCountBuilder('12'));

        const result = await analyzeVoteRiskSignals('proposal-1');

        expect(result.suspiciousSpike).toBe(true);
        expect(result.potentialBrigading).toBe(true);
        expect(result.duplicateAccountPattern).toBe(true);
        expect(result.reasons).toEqual(
            expect.arrayContaining([
                'vote_spike_detected',
                'coordinated_vote_burst',
                'new_account_vote_cluster',
            ])
        );
    });

    it('returns no reasons when activity is normal', async () => {
        const votes = [
            { created_at: '2026-03-23T12:00:01.000Z' },
            { created_at: '2026-03-23T12:00:08.000Z' },
            { created_at: '2026-03-23T12:00:15.000Z' },
        ];

        const dbMock = db as unknown as jest.Mock;
        dbMock
            .mockImplementationOnce(() => makeVotesBuilder(votes))
            .mockImplementationOnce(() => makeCountBuilder('2'));

        const result = await analyzeVoteRiskSignals('proposal-2');

        expect(result.suspiciousSpike).toBe(false);
        expect(result.potentialBrigading).toBe(false);
        expect(result.duplicateAccountPattern).toBe(false);
        expect(result.reasons).toHaveLength(0);
    });
});
