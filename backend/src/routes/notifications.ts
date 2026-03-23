import { Router, Request, Response } from 'express';
import { z } from 'zod';
import db from '../db';
import { authMiddleware } from '../middleware/auth';

const router = Router();

const updateSettingsSchema = z.object({
    enabled: z.boolean().optional(),
    emailEnabled: z.boolean().optional(),
    chatEnabled: z.boolean().optional(),
    proposalCreatedEnabled: z.boolean().optional(),
    voteConfirmationEnabled: z.boolean().optional(),
    voteReminderEnabled: z.boolean().optional(),
    voteResultEnabled: z.boolean().optional(),
    statusUpdateEnabled: z.boolean().optional(),
});

const communitySettingSchema = z.object({
    enabled: z.boolean(),
});

router.get('/', authMiddleware, async (req: Request, res: Response) => {
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '20', 10)));
    const unreadOnly = (req.query.unreadOnly as string) === 'true';
    const offset = (page - 1) * limit;

    let query = db('notifications').where({ user_id: req.user!.userId });
    if (unreadOnly) {
        query = query.andWhere({ read: false });
    }

    const notifications = await query.orderBy('created_at', 'desc').limit(limit).offset(offset);

    const [{ unreadCount }] = await db('notifications')
        .where({ user_id: req.user!.userId, read: false })
        .count('* as unreadCount');

    const [{ total }] = await db('notifications')
        .where({ user_id: req.user!.userId })
        .count('* as total');

    res.json({
        notifications,
        unreadCount: Number(unreadCount || 0),
        total: Number(total || 0),
        page,
        limit,
    });
});

router.patch('/:id/read', authMiddleware, async (req: Request, res: Response) => {
    const id = String(req.params.id);

    const updated = await db('notifications')
        .where({ id, user_id: req.user!.userId })
        .update({ read: true, read_at: new Date() });

    if (!updated) {
        res.status(404).json({ error: 'Notification not found.' });
        return;
    }

    res.json({ message: 'Notification marked as read.' });
});

router.post('/read-all', authMiddleware, async (req: Request, res: Response) => {
    await db('notifications')
        .where({ user_id: req.user!.userId, read: false })
        .update({ read: true, read_at: new Date() });

    res.json({ message: 'All notifications marked as read.' });
});

router.get('/settings', authMiddleware, async (req: Request, res: Response) => {
    let settings = await db('user_notification_settings').where({ user_id: req.user!.userId }).first();

    if (!settings) {
        const [created] = await db('user_notification_settings')
            .insert({ user_id: req.user!.userId })
            .returning('*');
        settings = created;
    }

    res.json({
        enabled: settings.enabled,
        emailEnabled: settings.email_enabled,
        chatEnabled: settings.chat_enabled,
        proposalCreatedEnabled: settings.proposal_created_enabled,
        voteConfirmationEnabled: settings.vote_confirmation_enabled,
        voteReminderEnabled: settings.vote_reminder_enabled,
        voteResultEnabled: settings.vote_result_enabled,
        statusUpdateEnabled: settings.status_update_enabled,
    });
});

router.put('/settings', authMiddleware, async (req: Request, res: Response) => {
    try {
        const body = updateSettingsSchema.parse(req.body);

        const payload: any = {};
        if (body.enabled !== undefined) payload.enabled = body.enabled;
        if (body.emailEnabled !== undefined) payload.email_enabled = body.emailEnabled;
        if (body.chatEnabled !== undefined) payload.chat_enabled = body.chatEnabled;
        if (body.proposalCreatedEnabled !== undefined) payload.proposal_created_enabled = body.proposalCreatedEnabled;
        if (body.voteConfirmationEnabled !== undefined) payload.vote_confirmation_enabled = body.voteConfirmationEnabled;
        if (body.voteReminderEnabled !== undefined) payload.vote_reminder_enabled = body.voteReminderEnabled;
        if (body.voteResultEnabled !== undefined) payload.vote_result_enabled = body.voteResultEnabled;
        if (body.statusUpdateEnabled !== undefined) payload.status_update_enabled = body.statusUpdateEnabled;

        const existing = await db('user_notification_settings').where({ user_id: req.user!.userId }).first();
        if (!existing) {
            await db('user_notification_settings').insert({ user_id: req.user!.userId, ...payload });
        } else {
            await db('user_notification_settings')
                .where({ user_id: req.user!.userId })
                .update({ ...payload, updated_at: new Date() });
        }

        res.json({ message: 'Notification settings updated.' });
    } catch (err) {
        if (err instanceof z.ZodError) {
            res.status(400).json({ error: 'Validation failed.', details: err.errors });
            return;
        }
        res.status(500).json({ error: 'Failed to update settings.' });
    }
});

router.get('/settings/communities', authMiddleware, async (req: Request, res: Response) => {
    const communities = await db('community_members as cm')
        .join('communities as c', 'cm.community_id', 'c.id')
        .leftJoin('community_notification_settings as cns', function () {
            this.on('cns.community_id', 'c.id').andOn('cns.user_id', db.raw('?', [req.user!.userId]));
        })
        .select('c.id', 'c.name', 'c.slug', db.raw('COALESCE(cns.enabled, true) as enabled'))
        .where({ 'cm.user_id': req.user!.userId })
        .orderBy('c.name', 'asc');

    res.json({ communities });
});

router.put('/settings/communities/:communityId', authMiddleware, async (req: Request, res: Response) => {
    try {
        const body = communitySettingSchema.parse(req.body);
        const communityId = String(req.params.communityId);

        const member = await db('community_members')
            .where({ community_id: communityId, user_id: req.user!.userId })
            .first();
        if (!member) {
            res.status(403).json({ error: 'Not a member of this community.' });
            return;
        }

        const existing = await db('community_notification_settings')
            .where({ user_id: req.user!.userId, community_id: communityId })
            .first();

        if (!existing) {
            await db('community_notification_settings').insert({
                user_id: req.user!.userId,
                community_id: communityId,
                enabled: body.enabled,
            });
        } else {
            await db('community_notification_settings')
                .where({ id: existing.id })
                .update({ enabled: body.enabled, updated_at: new Date() });
        }

        res.json({ message: 'Community notification setting updated.' });
    } catch (err) {
        if (err instanceof z.ZodError) {
            res.status(400).json({ error: 'Validation failed.', details: err.errors });
            return;
        }
        res.status(500).json({ error: 'Failed to update community notification setting.' });
    }
});

export default router;
