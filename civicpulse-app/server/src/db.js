import pg from 'pg';
import 'dotenv/config';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10
});

pool.on('error', (err) => console.error('Unexpected PG error', err));

export const q = (text, params) => pool.query(text, params);
