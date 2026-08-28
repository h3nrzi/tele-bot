import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyMigrations } from '@/core/database/migrate';
import * as schema from '@/core/database/schema';

dotenv.config();

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function setup(): Promise<void> {
  const connectionString =
    process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/tele_bot_test';

  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });

  try {
    const migrationsFolder = path.resolve(__dirname, '../../drizzle');
    await applyMigrations(db, migrationsFolder);
  } catch (err: any) {
    if (err?.code === 'ECONNREFUSED' || err?.message?.includes('ECONNREFUSED')) {
      console.warn('⚠️ Warning: PostgreSQL database is offline. Database-dependent tests will fail until PostgreSQL is running.');
    } else {
      throw err;
    }
  } finally {
    await pool.end();
  }
}
