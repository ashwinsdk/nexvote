import db from '../db';
import { detectRegistrationRisk } from './fraud';

jest.mock('../db', () => {
    const mockDb: any = jest.fn();
    mockDb.raw = jest.fn((sql: string) => sql);
    return {
        __esModule: true,
        default: mockDb,
    };
});

type Builder = {
    where: jest.Mock;
    andWhere: jest.Mock;
    count: jest.Mock;
    first: jest.Mock;
};

const makeCountBuilder = (countValue: string): Builder => {
    const builder: Partial<Builder> = {};
    builder.where = jest.fn(() => builder as Builder);
    builder.andWhere = jest.fn(() => builder as Builder);
    builder.count = jest.fn(() => builder as Builder);
    builder.first = jest.fn(async () => ({ count: countValue }));
    return builder as Builder;
};

describe('detectRegistrationRisk', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns medium severity for duplicate mobile hash', async () => {
        const dbMock = db as unknown as jest.Mock;
        dbMock
            .mockImplementationOnce(() => makeCountBuilder('1'))
            .mockImplementationOnce(() => makeCountBuilder('3'));

        const result = await detectRegistrationRisk({
            email: 'test@example.com',
            mobileHash: 'abc123',
            regionCode: 'in-tn-chennai',
        });

        expect(result.reasons).toContain('duplicate_mobile_hash');
        expect(result.severity).toBe('medium');
    });

    it('returns high severity for region registration spike', async () => {
        const dbMock = db as unknown as jest.Mock;
        dbMock
            .mockImplementationOnce(() => makeCountBuilder('0'))
            .mockImplementationOnce(() => makeCountBuilder('20'));

        const result = await detectRegistrationRisk({
            email: 'bulk@example.com',
            mobileHash: 'xyz999',
            regionCode: 'in-ka-bengaluru',
        });

        expect(result.reasons).toContain('registration_spike_region');
        expect(result.severity).toBe('high');
    });
});
