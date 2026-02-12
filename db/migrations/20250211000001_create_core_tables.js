/**
 * Migration: Create core NexVote tables.
 *
 * Tables: users, verifications, communities, community_members, proposals,
 *         proposal_metadata, votes, comments, admin_actions, donations, audit_log
 */

exports.up = async function (knex) {
    // Enable pgcrypto extension (required)
    await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    // Check if pgvector is available (optional for local dev)
    const vectorCheck = await knex.raw(`
        SELECT 1 FROM pg_available_extensions WHERE name = 'vector'
    `);
    const hasVectorExtension = vectorCheck.rows.length > 0;

    if (hasVectorExtension) {
        await knex.raw('CREATE EXTENSION IF NOT EXISTS "vector"');
    } else {
        console.warn('⚠️  pgvector extension not available - AI similarity features will be limited');
        console.warn('   To install: brew install pgvector (macOS) or see https://github.com/pgvector/pgvector');
    }

    // ── users ──────────────────────────────────────────────────────────────────
    await knex.schema.createTable('users', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.string('email').notNullable().unique();
        t.string('mobile_hash').nullable();
        t.string('password_hash').notNullable();
        t.string('display_name').notNullable();
        t.string('region_code').notNullable().index();
        t.string('public_key_hash').nullable();
        t.boolean('signup_verified').notNullable().defaultTo(false);
        t.enu('role', ['user', 'moderator', 'admin', 'superadmin']).notNullable().defaultTo('user');
        t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });

    // ── verifications ──────────────────────────────────────────────────────────
    await knex.schema.createTable('verifications', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        t.enu('method', ['email_otp', 'mobile_otp', 'aadhaar_sim', 'manual']).notNullable();
        t.uuid('verifier_id').nullable().references('id').inTable('users');
        t.enu('status', ['pending', 'verified', 'rejected', 'expired']).notNullable().defaultTo('pending');
        t.string('proof_hash').nullable();
        t.text('notes').nullable();
        t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        t.timestamp('verified_at').nullable();
    });

    // ── communities ────────────────────────────────────────────────────────────
    await knex.schema.createTable('communities', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.string('slug').notNullable().unique();
        t.string('name').notNullable();
        t.text('description').nullable();
        t.uuid('owner_user_id').notNullable().references('id').inTable('users');
        t.string('region_code').notNullable().index();
        t.string('category').notNullable().index();
        t.boolean('verified').notNullable().defaultTo(false);
        t.string('banner_ipfs_hash').nullable();
        t.string('avatar_ipfs_hash').nullable();
        t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });

    // ── community_members ──────────────────────────────────────────────────────
    await knex.schema.createTable('community_members', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('community_id').notNullable().references('id').inTable('communities').onDelete('CASCADE');
        t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        t.enu('role', ['member', 'moderator', 'owner']).notNullable().defaultTo('member');
        t.timestamp('joined_at').notNullable().defaultTo(knex.fn.now());
        t.unique(['community_id', 'user_id']);
    });

    // ── proposals ──────────────────────────────────────────────────────────────
    await knex.schema.createTable('proposals', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('community_id').notNullable().references('id').inTable('communities').onDelete('CASCADE');
        t.string('title').notNullable();
        t.text('text').notNullable();
        t.string('category').notNullable();
        t.enu('status', [
            'draft', 'active', 'voting', 'passed', 'failed', 'implemented', 'archived'
        ]).notNullable().defaultTo('draft');
        t.timestamp('deadline').nullable();
        t.text('summary').nullable();
        t.string('dedupe_hash').nullable();
        t.string('proposal_hash').nullable();
        t.string('result_hash').nullable();
        t.string('ipfs_hash').nullable();
        t.string('tx_hash').nullable();
        t.uuid('created_by').notNullable().references('id').inTable('users');
        t.string('region_code').notNullable().index();
        t.integer('yes_count').notNullable().defaultTo(0);
        t.integer('no_count').notNullable().defaultTo(0);
        t.integer('abstain_count').notNullable().defaultTo(0);
        t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
        t.timestamp('finalized_at').nullable();
    });

    // ── proposal_metadata (embeddings) ─────────────────────────────────────────
    await knex.schema.createTable('proposal_metadata', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('proposal_id').notNullable().unique().references('id').inTable('proposals').onDelete('CASCADE');
        t.jsonb('tags').nullable();
        t.jsonb('ai_categories').nullable();
        t.text('ai_summary').nullable();
        t.float('quality_score').nullable();
        t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    });

    // Add vector column for embeddings (pgvector) - only if extension available
    if (hasVectorExtension) {
        await knex.raw(`
            ALTER TABLE proposal_metadata
            ADD COLUMN embedding vector(384)
        `);
    } else {
        // Fallback: store as JSONB for local dev without pgvector
        await knex.schema.alterTable('proposal_metadata', (t) => {
            t.jsonb('embedding').nullable().comment('Fallback for missing pgvector extension');
        });
    }

    // ── votes ──────────────────────────────────────────────────────────────────
    await knex.schema.createTable('votes', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('proposal_id').notNullable().references('id').inTable('proposals').onDelete('CASCADE');
        t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        t.enu('choice', ['yes', 'no', 'abstain']).notNullable();
        t.integer('weight').notNullable().defaultTo(1);
        t.jsonb('signed_meta').nullable();
        t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
        t.unique(['proposal_id', 'user_id']);
    });

    // ── comments ───────────────────────────────────────────────────────────────
    await knex.schema.createTable('comments', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('proposal_id').notNullable().references('id').inTable('proposals').onDelete('CASCADE');
        t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        t.uuid('parent_id').nullable().references('id').inTable('comments').onDelete('CASCADE');
        t.text('body').notNullable();
        t.boolean('flagged').notNullable().defaultTo(false);
        t.boolean('removed').notNullable().defaultTo(false);
        t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });

    // ── admin_actions ──────────────────────────────────────────────────────────
    await knex.schema.createTable('admin_actions', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('admin_id').notNullable().references('id').inTable('users');
        t.uuid('proposal_id').nullable().references('id').inTable('proposals');
        t.uuid('community_id').nullable().references('id').inTable('communities');
        t.uuid('target_user_id').nullable().references('id').inTable('users');
        t.string('action_type').notNullable();
        t.text('description').nullable();
        t.string('status_hash').nullable();
        t.string('tx_hash').nullable();
        t.jsonb('metadata').nullable();
        t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    });

    // ── donations ──────────────────────────────────────────────────────────────
    await knex.schema.createTable('donations', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('proposal_id').notNullable().references('id').inTable('proposals').onDelete('CASCADE');
        t.uuid('donor_user_id').notNullable().references('id').inTable('users');
        t.decimal('amount', 14, 2).notNullable();
        t.string('currency').notNullable().defaultTo('INR');
        t.string('payment_provider').nullable();
        t.string('payment_ref').nullable();
        t.enu('status', ['pending', 'completed', 'refunded', 'failed']).notNullable().defaultTo('pending');
        t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    });

    // ── audit_log ──────────────────────────────────────────────────────────────
    await knex.schema.createTable('audit_log', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.string('event_type').notNullable().index();
        t.uuid('reference_id').nullable();
        t.string('reference_table').nullable();
        t.uuid('actor_id').nullable().references('id').inTable('users');
        t.string('hash_onchain').nullable();
        t.string('tx_hash').nullable();
        t.jsonb('details').nullable();
        t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    });

    // ── OTP tokens ─────────────────────────────────────────────────────────────
    await knex.schema.createTable('otp_tokens', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.string('identifier').notNullable(); // email or mobile hash
        t.string('otp_hash').notNullable();
        t.enu('type', ['email', 'mobile']).notNullable();
        t.boolean('used').notNullable().defaultTo(false);
        t.timestamp('expires_at').notNullable();
        t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        t.index(['identifier', 'type']);
    });
};

exports.down = async function (knex) {
    const tables = [
        'otp_tokens',
        'audit_log',
        'donations',
        'admin_actions',
        'comments',
        'votes',
        'proposal_metadata',
        'proposals',
        'community_members',
        'communities',
        'verifications',
        'users',
    ];

    for (const table of tables) {
        await knex.schema.dropTableIfExists(table);
    }

    await knex.raw('DROP EXTENSION IF EXISTS "vector"');
    await knex.raw('DROP EXTENSION IF EXISTS "pgcrypto"');
};
