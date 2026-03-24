import db from '../db';
import logger from '../logger';
import { notificationService } from './notifications';

type Severity = 'low' | 'medium' | 'high' | 'critical';

export const createFraudAlert = async (params: {
    alertType: string;
    severity: Severity;
    referenceTable?: string;
    referenceId?: string;
    actorId?: string;
    summary: string;
    details?: Record<string, any>;
}): Promise<void> => {
    try {
        const [alert] = await db('fraud_alerts')
            .insert({
                alert_type: params.alertType,
                severity: params.severity,
                status: 'open',
                reference_table: params.referenceTable || null,
                reference_id: params.referenceId || null,
                actor_id: params.actorId || null,
                summary: params.summary,
                details: params.details || null,
            })
            .returning('*');

        await db('audit_log').insert({
            event_type: 'fraud_alert_created',
            reference_id: alert.id,
            reference_table: 'fraud_alerts',
            actor_id: params.actorId || null,
            details: {
                alertType: params.alertType,
                severity: params.severity,
                referenceTable: params.referenceTable || null,
                referenceId: params.referenceId || null,
            },
        });

        const admins = await db('users')
            .select('id')
            .whereIn('role', ['admin', 'superadmin']);

        await Promise.all(
            admins.map((admin: any) =>
                notificationService.createInApp({
                    userId: admin.id,
                    actorId: params.actorId,
                    type: 'status_update',
                    title: 'Fraud alert raised',
                    body: `${params.alertType}: ${params.summary}`,
                    entityType: 'fraud_alert',
                    entityId: alert.id,
                    metadata: {
                        severity: params.severity,
                        referenceTable: params.referenceTable,
                        referenceId: params.referenceId,
                    },
                })
            )
        );
    } catch (err) {
        logger.debug({ err }, 'Failed to create fraud alert (migration may be pending)');
    }
};

export const detectRegistrationRisk = async (input: {
    email: string;
    mobileHash?: string;
    regionCode: string;
}): Promise<{ reasons: string[]; severity: Severity }> => {
    const reasons: string[] = [];

    if (input.mobileHash) {
        const existingMobile = await db('users')
            .where({ mobile_hash: input.mobileHash })
            .count('* as count')
            .first();
        if (parseInt(String(existingMobile?.count || '0'), 10) > 0) {
            reasons.push('duplicate_mobile_hash');
        }
    }

    const recentRegionRegistrations = await db('users')
        .where({ region_code: input.regionCode })
        .andWhere('created_at', '>=', db.raw("NOW() - INTERVAL '30 minutes'"))
        .count('* as count')
        .first();

    if (parseInt(String(recentRegionRegistrations?.count || '0'), 10) >= 20) {
        reasons.push('registration_spike_region');
    }

    let severity: Severity = 'low';
    if (reasons.includes('registration_spike_region')) severity = 'high';
    else if (reasons.length > 0) severity = 'medium';

    return { reasons, severity };
};
