import pg from 'pg';
import dotenv from 'dotenv';
import dns from 'node:dns/promises';

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing from .env');
}

const { Pool } = pg;

const databaseUrl = new URL(process.env.DATABASE_URL);
const databaseHost = databaseUrl.hostname;

let poolInstance: InstanceType<typeof Pool> | undefined;
let poolPromise: Promise<InstanceType<typeof Pool>> | undefined;

async function getPool() {
  if (poolInstance) return poolInstance;

  if (!poolPromise) {
    poolPromise = (async () => {
      const { address } = await dns.lookup(databaseHost, { family: 4 });
      const ipv4Url = new URL(process.env.DATABASE_URL!);
      ipv4Url.hostname = address;
      for (const key of ['sslmode', 'ssl', 'sslrootcert', 'sslcert', 'sslkey']) {
        ipv4Url.searchParams.delete(key);
      }

      const instance = new Pool({
        connectionString: ipv4Url.toString(),
        host: address,
        connectionTimeoutMillis: 15000,
        ssl: { rejectUnauthorized: true, servername: databaseHost }
      });
      instance.on('connect', () => console.log('PostgreSQL connection established.'));
      poolInstance = instance;
      return instance;
    })();
  }

  return poolPromise;
}

export const pool = {
  query: async (...args: Parameters<InstanceType<typeof Pool>['query']>) =>
    (await getPool()).query(...args),
  connect: async () => (await getPool()).connect(),
  end: async () => poolInstance?.end()
} as Pick<InstanceType<typeof Pool>, 'query' | 'connect' | 'end'>;

export async function query(text: string, params: unknown[] = []) {
  const result = await pool.query(text, params);
  return {
    rows: result.rows as Record<string, any>[],
    rowCount: result.rowCount ?? 0
  };
}

export async function initializeDatabase() {
  await query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name VARCHAR(120) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      phone VARCHAR(25),
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL CHECK (role IN ('seeker', 'agent', 'admin')),
      email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      agent_status VARCHAR(20) NOT NULL DEFAULT 'not_applicable'
        CHECK (agent_status IN ('not_applicable', 'pending', 'approved', 'rejected')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ
  `);

  console.log('Nestora database tables initialized.');
}
