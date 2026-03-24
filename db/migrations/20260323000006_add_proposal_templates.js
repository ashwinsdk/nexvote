/**
 * Migration: Add proposal templates and field definitions.
 */

exports.up = async function (knex) {
    await knex.schema.createTable('proposal_templates', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('community_id').nullable().references('id').inTable('communities').onDelete('CASCADE');
        t.string('name').notNullable();
        t.text('description').nullable();
        t.string('category').notNullable();
        t.boolean('is_default').notNullable().defaultTo(false);
        t.boolean('enabled').notNullable().defaultTo(true);
        t.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

        t.index(['community_id', 'enabled']);
        t.index(['category', 'enabled']);
    });

    await knex.schema.createTable('proposal_template_fields', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('template_id').notNullable().references('id').inTable('proposal_templates').onDelete('CASCADE');
        t.string('field_key').notNullable();
        t.string('label').notNullable();
        t.string('field_type').notNullable().defaultTo('text');
        t.boolean('required').notNullable().defaultTo(false);
        t.text('placeholder').nullable();
        t.text('help_text').nullable();
        t.integer('display_order').notNullable().defaultTo(0);
        t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

        t.unique(['template_id', 'field_key']);
        t.index(['template_id', 'display_order']);
    });
};

exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('proposal_template_fields');
    await knex.schema.dropTableIfExists('proposal_templates');
};
