import { describe, it, expect, afterAll } from 'vitest';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

describe('Database Migrations', () => {
  const connectionString =
    process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/tele_bot_test';

  const pool = new Pool({ connectionString });

  afterAll(async () => {
    await pool.end();
  });

  it('applies migrations before the test suite runs and creates users, wallets, and exchange_rates tables', async () => {
    const res = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('users', 'wallets', 'exchange_rates')
      ORDER BY table_name;
    `);

    const tableNames = res.rows.map((row) => row.table_name);
    expect(tableNames).toEqual(['exchange_rates', 'users', 'wallets']);
  });

  it('creates the users table with the required columns and types', async () => {
    const res = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users'
      ORDER BY column_name;
    `);

    const columns = Object.fromEntries(
      res.rows.map((row) => [row.column_name, { type: row.data_type, nullable: row.is_nullable }])
    );

    expect(columns).toMatchObject({
      id: { type: 'uuid', nullable: 'NO' },
      telegram_chat_id: { type: 'bigint', nullable: 'NO' },
      telegram_username: { type: 'character varying', nullable: 'YES' },
      created_at: { type: 'timestamp with time zone', nullable: 'NO' },
    });
  });

  it('creates the wallets table with the required columns and types', async () => {
    const res = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'wallets'
      ORDER BY column_name;
    `);

    const columns = Object.fromEntries(
      res.rows.map((row) => [row.column_name, { type: row.data_type, nullable: row.is_nullable }])
    );

    expect(columns).toMatchObject({
      id: { type: 'uuid', nullable: 'NO' },
      user_id: { type: 'uuid', nullable: 'NO' },
      available_balance: { type: 'numeric', nullable: 'NO' },
      updated_at: { type: 'timestamp with time zone', nullable: 'NO' },
    });
  });

  it('creates the exchange_rates table with the required columns and types', async () => {
    const res = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'exchange_rates'
      ORDER BY column_name;
    `);

    const columns = Object.fromEntries(
      res.rows.map((row) => [row.column_name, { type: row.data_type, nullable: row.is_nullable }])
    );

    expect(columns).toMatchObject({
      id: { type: 'uuid', nullable: 'NO' },
      irr_per_usd: { type: 'bigint', nullable: 'NO' },
      created_by_admin_telegram_id: { type: 'bigint', nullable: 'NO' },
      created_at: { type: 'timestamp with time zone', nullable: 'NO' },
    });
  });
});
