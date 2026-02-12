exports.up = async function (knex) {
    await knex.schema.alterTable('communities', (t) => {
        t.string('name_en').nullable();
        t.string('name_lang').nullable();
        t.text('description_en').nullable();
        t.string('description_lang').nullable();
    });

    await knex.schema.alterTable('proposals', (t) => {
        t.text('title_en').nullable();
        t.string('title_lang').nullable();
        t.text('text_en').nullable();
        t.string('text_lang').nullable();
        t.text('summary_en').nullable();
        t.string('summary_lang').nullable();
    });

    await knex.schema.alterTable('comments', (t) => {
        t.text('body_en').nullable();
        t.string('body_lang').nullable();
    });

    await knex('communities').update({
        name_en: knex.ref('name'),
        name_lang: 'en',
        description_en: knex.ref('description'),
        description_lang: 'en',
    });

    await knex('proposals').update({
        title_en: knex.ref('title'),
        title_lang: 'en',
        text_en: knex.ref('text'),
        text_lang: 'en',
        summary_en: knex.ref('summary'),
        summary_lang: 'en',
    });

    await knex('comments').update({
        body_en: knex.ref('body'),
        body_lang: 'en',
    });
};

exports.down = async function (knex) {
    await knex.schema.alterTable('comments', (t) => {
        t.dropColumn('body_en');
        t.dropColumn('body_lang');
    });

    await knex.schema.alterTable('proposals', (t) => {
        t.dropColumn('title_en');
        t.dropColumn('title_lang');
        t.dropColumn('text_en');
        t.dropColumn('text_lang');
        t.dropColumn('summary_en');
        t.dropColumn('summary_lang');
    });

    await knex.schema.alterTable('communities', (t) => {
        t.dropColumn('name_en');
        t.dropColumn('name_lang');
        t.dropColumn('description_en');
        t.dropColumn('description_lang');
    });
};
