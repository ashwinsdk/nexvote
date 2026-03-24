import db from '../db';
import logger from '../logger';
import { emailService } from './email';

type NotificationType =
    | 'proposal_created'
    | 'vote_confirmation'
    | 'vote_reminder'
    | 'vote_result'
    | 'status_update'
    | 'chat';

type SettingType =
    | 'proposal_created_enabled'
    | 'vote_confirmation_enabled'
    | 'vote_reminder_enabled'
    | 'vote_result_enabled'
    | 'status_update_enabled';

type CreateNotificationInput = {
    userId: string;
    actorId?: string;
    type: NotificationType;
    title: string;
    body: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, any>;
};

const DEFAULT_SETTINGS = {
    enabled: true,
    email_enabled: false,
    chat_enabled: false,
    proposal_created_enabled: true,
    vote_confirmation_enabled: true,
    vote_reminder_enabled: true,
    vote_result_enabled: true,
    status_update_enabled: true,
};

class NotificationService {
    async ensureUserSettings(userId: string): Promise<any> {
        let settings = await db('user_notification_settings').where({ user_id: userId }).first();
        if (!settings) {
            const [created] = await db('user_notification_settings')
                .insert({ user_id: userId, ...DEFAULT_SETTINGS })
                .returning('*');
            settings = created;
        }
        return settings;
    }

    async createInApp(input: CreateNotificationInput): Promise<void> {
        const settings = await this.ensureUserSettings(input.userId);
        if (!settings.enabled) {
            return;
        }

        await db('notifications').insert({
            user_id: input.userId,
            actor_id: input.actorId || null,
            type: input.type,
            title: input.title,
            body: input.body,
            entity_type: input.entityType || null,
            entity_id: input.entityId || null,
            metadata: input.metadata || null,
        });

        await this.pushFeedItem({
            userId: input.userId,
            eventType: input.type,
            entityType: input.entityType || null,
            entityId: input.entityId || null,
            metadata: {
                title: input.title,
                body: input.body,
                ...(input.metadata || {}),
            },
        });
    }

    async pushFeedItem(params: {
        userId: string;
        eventType: string;
        entityType?: string | null;
        entityId?: string | null;
        metadata?: Record<string, any>;
    }): Promise<void> {
        try {
            await db('personalized_feed_items').insert({
                user_id: params.userId,
                event_type: params.eventType,
                entity_type: params.entityType || null,
                entity_id: params.entityId || null,
                metadata: params.metadata || null,
            });
        } catch (err) {
            logger.debug({ err }, 'Skipping feed item insert (migration may be pending)');
        }
    }

    async sendEmailIfEnabled(params: {
        userId: string;
        settingKey: SettingType;
        subject: string;
        html: string;
    }): Promise<void> {
        const settings = await this.ensureUserSettings(params.userId);
        if (!settings.enabled || !settings.email_enabled || !settings[params.settingKey]) {
            return;
        }

        const user = await db('users').select('email').where({ id: params.userId }).first();
        if (!user?.email) {
            return;
        }

        await emailService.send({
            to: user.email,
            subject: params.subject,
            html: params.html,
        });
    }

    async isCommunityAllowed(userId: string, communityId: string): Promise<boolean> {
        const row = await db('community_notification_settings')
            .where({ user_id: userId, community_id: communityId })
            .first();
        return row ? !!row.enabled : true;
    }

    async notifyProposalCreated(params: {
        proposalId: string;
        communityId: string;
        communityName: string;
        category: string;
        deadline: string;
        title: string;
        actorId: string;
    }): Promise<void> {
        const members = await db('community_members as cm')
            .join('users as u', 'cm.user_id', 'u.id')
            .select('u.id as user_id')
            .where({ 'cm.community_id': params.communityId });

        await Promise.all(
            members
                .filter((m: any) => m.user_id !== params.actorId)
                .map(async (member: any) => {
                    if (!(await this.isCommunityAllowed(member.user_id, params.communityId))) {
                        return;
                    }

                    await this.createInApp({
                        userId: member.user_id,
                        actorId: params.actorId,
                        type: 'proposal_created',
                        title: 'New policy created',
                        body: `${params.communityName} • ${params.category} • ends ${new Date(
                            params.deadline
                        ).toLocaleString()}`,
                        entityType: 'proposal',
                        entityId: params.proposalId,
                        metadata: {
                            communityId: params.communityId,
                            communityName: params.communityName,
                            category: params.category,
                            deadline: params.deadline,
                        },
                    });

                    await this.sendEmailIfEnabled({
                        userId: member.user_id,
                        settingKey: 'proposal_created_enabled',
                        subject: `New proposal in ${params.communityName}`,
                        html: `<p>A new proposal was created in <strong>${params.communityName}</strong>:</p><p>${params.title}</p><p>Voting ends at: ${new Date(
                            params.deadline
                        ).toLocaleString()}</p>`,
                    });
                })
        );
    }

    async notifyVoteConfirmation(params: {
        userId: string;
        proposalId: string;
        proposalTitle: string;
        choice: string;
    }): Promise<void> {
        const settings = await this.ensureUserSettings(params.userId);
        if (settings.enabled && settings.vote_confirmation_enabled && settings.chat_enabled) {
            await this.createInApp({
                userId: params.userId,
                type: 'vote_confirmation',
                title: 'Vote submitted',
                body: `Your vote (${params.choice}) was recorded for ${params.proposalTitle}.`,
                entityType: 'proposal',
                entityId: params.proposalId,
            });
        }

        await this.sendEmailIfEnabled({
            userId: params.userId,
            settingKey: 'vote_confirmation_enabled',
            subject: 'Vote recorded on NexVote',
            html: `<p>Your vote <strong>${params.choice}</strong> was recorded for:</p><p>${params.proposalTitle}</p>`,
        });
    }

    async notifyVoteOutcome(params: {
        proposalId: string;
        title: string;
        status: string;
        communityId: string;
    }): Promise<void> {
        const members = await db('community_members').select('user_id').where({ community_id: params.communityId });
        const watchers = await db('proposal_watchers').select('user_id').where({ proposal_id: params.proposalId });
        const recipients = new Set<string>([
            ...members.map((m: any) => m.user_id),
            ...watchers.map((w: any) => w.user_id),
        ]);

        await Promise.all(
            Array.from(recipients).map(async (userId) => {
                if (!(await this.isCommunityAllowed(userId, params.communityId))) {
                    return;
                }
                await this.createInApp({
                    userId,
                    type: 'vote_result',
                    title: 'Voting result published',
                    body: `${params.title} is now ${params.status}.`,
                    entityType: 'proposal',
                    entityId: params.proposalId,
                });

                await this.sendEmailIfEnabled({
                    userId,
                    settingKey: 'vote_result_enabled',
                    subject: 'Voting result is out',
                    html: `<p><strong>${params.title}</strong> status: <strong>${params.status}</strong>.</p>`,
                });
            })
        );
    }

    async notifyStatusUpdate(params: {
        proposalId: string;
        title: string;
        status: string;
        communityId: string;
        actorId: string;
    }): Promise<void> {
        const members = await db('community_members').select('user_id').where({ community_id: params.communityId });
        const watchers = await db('proposal_watchers').select('user_id').where({ proposal_id: params.proposalId });
        const recipients = new Set<string>([
            ...members.map((m: any) => m.user_id),
            ...watchers.map((w: any) => w.user_id),
        ]);

        await Promise.all(
            Array.from(recipients).map(async (userId) => {
                if (!(await this.isCommunityAllowed(userId, params.communityId))) {
                    return;
                }
                await this.createInApp({
                    userId,
                    actorId: params.actorId,
                    type: 'status_update',
                    title: 'Policy status updated',
                    body: `${params.title} is now marked as ${params.status}.`,
                    entityType: 'proposal',
                    entityId: params.proposalId,
                });

                await this.sendEmailIfEnabled({
                    userId,
                    settingKey: 'status_update_enabled',
                    subject: 'Policy status updated',
                    html: `<p><strong>${params.title}</strong> has been updated to <strong>${params.status}</strong>.</p>`,
                });
            })
        );
    }

    async sendVoteReminders(): Promise<number> {
        const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
        const windowStart = new Date(Date.now() + 45 * 60 * 1000);

        const candidates = await db('proposals')
            .select('id', 'title', 'community_id', 'deadline')
            .where('status', 'voting')
            .whereNotNull('deadline')
            .whereNull('reminder_sent_at')
            .where('deadline', '>=', windowStart)
            .where('deadline', '<=', oneHourFromNow)
            .limit(100);

        let notified = 0;
        for (const proposal of candidates as any[]) {
            const members = await db('community_members')
                .leftJoin('votes', function () {
                    this.on('votes.user_id', 'community_members.user_id').andOn(
                        'votes.proposal_id',
                        db.raw('?', [proposal.id])
                    );
                })
                .select('community_members.user_id')
                .where({ 'community_members.community_id': proposal.community_id })
                .whereNull('votes.id');

            await Promise.all(
                members.map(async (m: any) => {
                    if (!(await this.isCommunityAllowed(m.user_id, proposal.community_id))) {
                        return;
                    }
                    await this.createInApp({
                        userId: m.user_id,
                        type: 'vote_reminder',
                        title: 'Voting ending soon',
                        body: `${proposal.title} ends in less than 1 hour.`,
                        entityType: 'proposal',
                        entityId: proposal.id,
                    });

                    await this.sendEmailIfEnabled({
                        userId: m.user_id,
                        settingKey: 'vote_reminder_enabled',
                        subject: 'Reminder: Vote ending soon',
                        html: `<p>Reminder: <strong>${proposal.title}</strong> ends in less than 1 hour.</p>`,
                    });
                })
            );

            await db('proposals').where({ id: proposal.id }).update({ reminder_sent_at: new Date() });
            notified += members.length;
        }

        return notified;
    }

    async safeReminderSweep(): Promise<void> {
        try {
            await this.sendVoteReminders();
        } catch (err) {
            logger.debug({ err }, 'Notification reminder sweep failed');
        }
    }
}

export const notificationService = new NotificationService();
