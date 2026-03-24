/**
 * Migration: Add governance execution feature foundations.
 *
 * Adds:
 * - Proposal quality controls and review workflow fields
 * - Community quorum/min-voter governance settings
 * - Discussion enrichment fields (stance/sentiment/clustering/pinned expert)
 * - Implementation tracking tables
 * - Follow/watchlist and activity feed tables
 */

exports.up = async function (knex) {
    // Proposal quality + review workflow
    await knex.schema.alterTable('proposals', (t) => {
        t.text('problem_statement').nullable();
        t.text('beneficiaries').nullable();
        t.text('timeline').nullable();
        t.decimal('budget_estimate', 14, 2).nullable();
        t.text('impact_summary').nullable();
        t.text('risk_analysis').nullable();
        t.jsonb('attachments_proof').nullable();

        t.enu('review_status', ['draft', 'pending_review', 'changes_requested', 'approved']).notNullable().defaultTo('draft');
        t.uuid('reviewed_by').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.timestamp('submitted_for_review_at').nullable();
        t.timestamp('reviewed_at').nullable();
        t.text('review_notes').nullable();
        t.timestamp('published_at').nullable();

        t.integer('eligible_voter_count_snapshot').nullable();
        t.float('participation_rate').nullable();
        t.boolean('quorum_met').nullable();
    });

    await knex.schema.createTable('community_governance_settings', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('community_id').notNullable().unique().references('id').inTable('communities').onDelete('CASCADE');
        t.float('quorum_percent').notNullable().defaultTo(20);
        t.integer('min_voter_count').notNullable().defaultTo(10);
        t.boolean('enabled').notNullable().defaultTo(true);
        t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });

    // Seed governance settings for existing communities.
    await knex.raw(`
        INSERT INTO community_governance_settings (community_id, quorum_percent, min_voter_count, enabled)
        SELECT id, 20, 10, true
        FROM communities
        ON CONFLICT (community_id) DO NOTHING
    `);

    // Discussion enrichment
    await knex.schema.alterTable('comments', (t) => {
        t.enu('stance', ['for', 'against', 'neutral']).nullable();
        t.string('sentiment_label').nullable();
        t.float('sentiment_confidence').nullable();
        t.string('cluster_label').nullable();
        t.boolean('is_pinned_expert').notNullable().defaultTo(false);
        t.boolean('auto_hidden').notNullable().defaultTo(false);
        t.string('moderation_reason').nullable();
        t.jsonb('ai_flags').nullable();
    });

    // Implementation tracking
    await knex.schema.createTable('proposal_implementations', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('proposal_id').notNullable().unique().references('id').inTable('proposals').onDelete('CASCADE');
        t.enu('status', ['not_started', 'in_progress', 'blocked', 'completed']).notNullable().defaultTo('not_started');
        t.string('department').nullable();
        t.integer('completion_percent').notNullable().defaultTo(0);
        t.decimal('total_budget', 14, 2).nullable();
        t.decimal('released_budget', 14, 2).notNullable().defaultTo(0);
        t.timestamp('start_date').nullable();
        t.timestamp('target_date').nullable();
        t.timestamp('completed_at').nullable();
        t.boolean('public_complete').notNullable().defaultTo(false);
        t.uuid('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });

    await knex.schema.createTable('implementation_milestones', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('implementation_id').notNullable().references('id').inTable('proposal_implementations').onDelete('CASCADE');
        t.string('title').notNullable();
        t.text('description').nullable();
        t.enu('status', ['pending', 'in_progress', 'completed', 'blocked']).notNullable().defaultTo('pending');
        t.timestamp('due_date').nullable();
        t.timestamp('completed_at').nullable();
        t.uuid('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });

    await knex.schema.createTable('implementation_budget_releases', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('implementation_id').notNullable().references('id').inTable('proposal_implementations').onDelete('CASCADE');
        t.integer('stage').notNullable();
        t.decimal('amount', 14, 2).notNullable();
        t.text('notes').nullable();
        t.uuid('approved_by').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.timestamp('released_at').notNullable().defaultTo(knex.fn.now());
    });

    await knex.schema.createTable('implementation_updates', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('implementation_id').notNullable().references('id').inTable('proposal_implementations').onDelete('CASCADE');
        t.text('message').notNullable();
        t.integer('completion_percent').nullable();
        t.uuid('author_id').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    });

    await knex.schema.createTable('implementation_proof_files', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('implementation_id').notNullable().references('id').inTable('proposal_implementations').onDelete('CASCADE');
        t.string('label').notNullable();
        t.string('url').notNullable();
        t.string('mime_type').nullable();
        t.uuid('uploaded_by').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    });

    // Watchlist + feed
    await knex.schema.createTable('proposal_watchers', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('proposal_id').notNullable().references('id').inTable('proposals').onDelete('CASCADE');
        t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        t.unique(['proposal_id', 'user_id']);
    });

    await knex.schema.createTable('personalized_feed_items', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE').index();
        t.string('event_type').notNullable().index();
        t.uuid('entity_id').nullable();
        t.string('entity_type').nullable();
        t.jsonb('metadata').nullable();
        t.timestamp('created_at').notNullable().defaultTo(knex.fn.now()).index();
    });

    // Helpful indexes for new workflows.
    await knex.schema.alterTable('proposals', (t) => {
        t.index(['community_id', 'review_status']);
        t.index(['status', 'deadline']);
    });

    await knex.schema.alterTable('comments', (t) => {
        t.index(['proposal_id', 'stance']);
        t.index(['proposal_id', 'is_pinned_expert']);
        t.index(['proposal_id', 'auto_hidden']);
    });
};

exports.down = async function (knex) {
    await knex.schema.alterTable('comments', (t) => {
        t.dropIndex(['proposal_id', 'auto_hidden']);
        t.dropIndex(['proposal_id', 'is_pinned_expert']);
        t.dropIndex(['proposal_id', 'stance']);
    });

    await knex.schema.alterTable('proposals', (t) => {
        t.dropIndex(['status', 'deadline']);
        t.dropIndex(['community_id', 'review_status']);
    });

    await knex.schema.dropTableIfExists('personalized_feed_items');
    await knex.schema.dropTableIfExists('proposal_watchers');
    await knex.schema.dropTableIfExists('implementation_proof_files');
    await knex.schema.dropTableIfExists('implementation_updates');
    await knex.schema.dropTableIfExists('implementation_budget_releases');
    await knex.schema.dropTableIfExists('implementation_milestones');
    await knex.schema.dropTableIfExists('proposal_implementations');

    await knex.schema.alterTable('comments', (t) => {
        t.dropColumn('stance');
        t.dropColumn('sentiment_label');
        t.dropColumn('sentiment_confidence');
        t.dropColumn('cluster_label');
        t.dropColumn('is_pinned_expert');
        t.dropColumn('auto_hidden');
        t.dropColumn('moderation_reason');
        t.dropColumn('ai_flags');
    });

    await knex.schema.dropTableIfExists('community_governance_settings');

    await knex.schema.alterTable('proposals', (t) => {
        t.dropColumn('problem_statement');
        t.dropColumn('beneficiaries');
        t.dropColumn('timeline');
        t.dropColumn('budget_estimate');
        t.dropColumn('impact_summary');
        t.dropColumn('risk_analysis');
        t.dropColumn('attachments_proof');
        t.dropColumn('review_status');
        t.dropColumn('reviewed_by');
        t.dropColumn('submitted_for_review_at');
        t.dropColumn('reviewed_at');
        t.dropColumn('review_notes');
        t.dropColumn('published_at');
        t.dropColumn('eligible_voter_count_snapshot');
        t.dropColumn('participation_rate');
        t.dropColumn('quorum_met');
    });
};
