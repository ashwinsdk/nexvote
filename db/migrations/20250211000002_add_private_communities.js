/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    // Add is_private column to communities
    await knex.schema.alterTable('communities', (table) => {
        table.boolean('is_private').defaultTo(false).notNullable();
    });

    // Add approval fields to community_members
    await knex.schema.alterTable('community_members', (table) => {
        table.enum('status', ['pending', 'approved', 'rejected']).defaultTo('approved').notNullable();
        table.timestamp('approved_at');
        table.integer('approved_by').unsigned().references('id').inTable('users').onDelete('SET NULL');
    });

    // Create community_join_requests table
    await knex.schema.createTable('community_join_requests', (table) => {
        table.increments('id').primary();
        table.integer('community_id').unsigned().notNullable().references('id').inTable('communities').onDelete('CASCADE');
        table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.text('message');
        table.enum('status', ['pending', 'approved', 'rejected']).defaultTo('pending').notNullable();
        table.timestamp('requested_at').defaultTo(knex.fn.now());
        table.timestamp('resolved_at');
        table.integer('resolved_by').unsigned().references('id').inTable('users').onDelete('SET NULL');
        table.timestamps(true, true);

        table.unique(['community_id', 'user_id']);
        table.index('community_id');
        table.index('user_id');
        table.index('status');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('community_join_requests');

    await knex.schema.alterTable('community_members', (table) => {
        table.dropColumn('status');
        table.dropColumn('approved_at');
        table.dropColumn('approved_by');
    });

    await knex.schema.alterTable('communities', (table) => {
        table.dropColumn('is_private');
    });
};
