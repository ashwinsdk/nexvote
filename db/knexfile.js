require('dotenv').config({ path: '../.env' });

module.exports = {
    development: {
        client: 'pg',
        connection: process.env.DATABASE_URL || 'postgresql://nexvote:nexvote@localhost:5432/nexvote',
        pool: {
            min: parseInt(process.env.DATABASE_POOL_MIN || '2', 10),
            max: parseInt(process.env.DATABASE_POOL_MAX || '10', 10),
        },
        migrations: {
            directory: './migrations',
            tableName: 'knex_migrations',
        },
        seeds: {
            directory: './seeds',
        },
    },

    production: {
        client: 'pg',
        connection: process.env.DATABASE_URL,
        pool: {
            min: parseInt(process.env.DATABASE_POOL_MIN || '2', 10),
            max: parseInt(process.env.DATABASE_POOL_MAX || '10', 10),
        },
        migrations: {
            directory: './migrations',
            tableName: 'knex_migrations',
        },
        seeds: {
            directory: './seeds',
        },
    },
};
