import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyMigrations } from '../../src/db/migrate';

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
  const db = drizzle(pool);

  try {
    const migrationsFolder = path.resolve(__dirname, '../../drizzle');
    await applyMigrations(db, migrationsFolder);
  } finally {
    await pool.end();
  }
}
