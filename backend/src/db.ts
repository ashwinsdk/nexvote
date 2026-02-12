import knex from 'knex';
import { config } from './config';

export const db = knex({
    client: 'pg',
    connection: config.databaseUrl,
    pool: {
        min: config.dbPoolMin,
        max: config.dbPoolMax,
    },
});

export default db;
