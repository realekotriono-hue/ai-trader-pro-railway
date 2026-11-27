import pg from 'pg';
const { Pool } = pg;
if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL is not set; database-backed endpoints will fail until Railway PostgreSQL is attached.');
}
export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : (process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }),
  max: Number(process.env.PGPOOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});
db.on('error', err => console.error('Unexpected PostgreSQL pool error:', err));
