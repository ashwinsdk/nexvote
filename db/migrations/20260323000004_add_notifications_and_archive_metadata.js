exports.up = async function (knex) {
    await knex.schema.alterTable('proposals', (t) => {
        t.string('archived_from_status').nullable();
        t.timestamp('reminder_sent_at').nullable();
    });

    await knex.schema.createTable('user_notification_settings', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('user_id').notNullable().unique().references('id').inTable('users').onDelete('CASCADE');
        t.boolean('enabled').notNullable().defaultTo(true);
        t.boolean('email_enabled').notNullable().defaultTo(false);
        t.boolean('chat_enabled').notNullable().defaultTo(false);
        t.boolean('proposal_created_enabled').notNullable().defaultTo(true);
        t.boolean('vote_confirmation_enabled').notNullable().defaultTo(true);
        t.boolean('vote_reminder_enabled').notNullable().defaultTo(true);
        t.boolean('vote_result_enabled').notNullable().defaultTo(true);
        t.boolean('status_update_enabled').notNullable().defaultTo(true);
        t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });

    await knex.schema.createTable('community_notification_settings', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        t.uuid('community_id').notNullable().references('id').inTable('communities').onDelete('CASCADE');
        t.boolean('enabled').notNullable().defaultTo(true);
        t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
        t.unique(['user_id', 'community_id']);
    });

    await knex.schema.createTable('notifications', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        t.uuid('actor_id').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.string('type').notNullable().index();
        t.string('title').notNullable();
        t.text('body').notNullable();
        t.string('entity_type').nullable();
        t.uuid('entity_id').nullable();
        t.jsonb('metadata').nullable();
        t.boolean('read').notNullable().defaultTo(false).index();
        t.timestamp('read_at').nullable();
        t.timestamp('created_at').notNullable().defaultTo(knex.fn.now()).index();
    });
};

exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('notifications');
    await knex.schema.dropTableIfExists('community_notification_settings');
    await knex.schema.dropTableIfExists('user_notification_settings');

    await knex.schema.alterTable('proposals', (t) => {
        t.dropColumn('archived_from_status');
        t.dropColumn('reminder_sent_at');
    });
};
