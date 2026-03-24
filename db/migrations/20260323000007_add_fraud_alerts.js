/**
 * Migration: Add fraud and abuse alert queue.
 */

exports.up = async function (knex) {
    await knex.schema.createTable('fraud_alerts', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.string('alert_type').notNullable().index();
        t.enu('severity', ['low', 'medium', 'high', 'critical']).notNullable().defaultTo('medium').index();
        t.enu('status', ['open', 'in_review', 'resolved', 'dismissed']).notNullable().defaultTo('open').index();
        t.string('reference_table').nullable().index();
        t.uuid('reference_id').nullable().index();
        t.uuid('actor_id').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.text('summary').notNullable();
        t.jsonb('details').nullable();
        t.uuid('resolved_by').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.text('resolution_notes').nullable();
        t.timestamp('resolved_at').nullable();
        t.timestamp('created_at').notNullable().defaultTo(knex.fn.now()).index();
        t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });
};

exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('fraud_alerts');
};
