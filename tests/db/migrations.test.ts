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

  it('applies migrations before the test suite runs and creates users, wallets, exchange_rates, bank_accounts, and top_up_requests tables', async () => {
    const res = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('users', 'wallets', 'exchange_rates', 'bank_accounts', 'top_up_requests')
      ORDER BY table_name;
    `);

    const tableNames = res.rows.map((row) => row.table_name);
    expect(tableNames).toEqual(['bank_accounts', 'exchange_rates', 'top_up_requests', 'users', 'wallets']);
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

  it('creates the bank_accounts table with the required columns and types', async () => {
    const res = await pool.query(`
      SELECT column_name, data_type, is_nullable, character_maximum_length, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'bank_accounts'
      ORDER BY column_name;
    `);

    const columns = Object.fromEntries(
      res.rows.map((row) => [
        row.column_name,
        {
          type: row.data_type,
          nullable: row.is_nullable,
          maxLength: row.character_maximum_length,
          default: row.column_default,
        },
      ])
    );

    expect(columns).toMatchObject({
      id: { type: 'uuid', nullable: 'NO' },
      card_number: { type: 'character varying', nullable: 'NO', maxLength: 16 },
      card_holder_name: { type: 'character varying', nullable: 'NO' },
      bank_name: { type: 'character varying', nullable: 'NO' },
      additional_notes: { type: 'text', nullable: 'YES' },
      is_active: { type: 'boolean', nullable: 'NO' },
      created_at: { type: 'timestamp with time zone', nullable: 'NO' },
    });
    expect(columns.is_active.default).toContain('false');
  });

  it('creates the top_up_status enum with the required values', async () => {
    const res = await pool.query(`
      SELECT enumlabel
      FROM pg_enum
      JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
      WHERE pg_type.typname = 'top_up_status'
      ORDER BY enumsortorder;
    `);

    const enumValues = res.rows.map((row) => row.enumlabel);
    expect(enumValues).toEqual([
      'INITIATED',
      'PENDING',
      'APPROVED',
      'REJECTED',
      'EXPIRED',
      'CANCELLED',
    ]);
  });

  it('creates the top_up_requests table with the required columns and types', async () => {
    const res = await pool.query(`
      SELECT column_name, data_type, udt_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'top_up_requests'
      ORDER BY column_name;
    `);

    const columns = Object.fromEntries(
      res.rows.map((row) => [
        row.column_name,
        {
          type: row.data_type,
          udtName: row.udt_name,
          nullable: row.is_nullable,
        },
      ])
    );

    expect(columns).toMatchObject({
      id: { type: 'uuid', nullable: 'NO' },
      user_id: { type: 'uuid', nullable: 'NO' },
      exchange_rate_id: { type: 'uuid', nullable: 'NO' },
      usd_amount: { type: 'numeric', nullable: 'NO' },
      irr_amount: { type: 'bigint', nullable: 'NO' },
      status: { type: 'USER-DEFINED', udtName: 'top_up_status', nullable: 'NO' },
      receipt_file_id: { type: 'character varying', nullable: 'YES' },
      receipt_caption: { type: 'text', nullable: 'YES' },
      rejection_reason: { type: 'text', nullable: 'YES' },
      expires_at: { type: 'timestamp with time zone', nullable: 'NO' },
      processed_by_admin_telegram_id: { type: 'bigint', nullable: 'YES' },
      processed_at: { type: 'timestamp with time zone', nullable: 'YES' },
      created_at: { type: 'timestamp with time zone', nullable: 'NO' },
      updated_at: { type: 'timestamp with time zone', nullable: 'NO' },
    });
  });

  it('creates foreign key constraints for top_up_requests', async () => {
    const res = await pool.query(`
      SELECT
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'top_up_requests';
    `);

    const foreignKeys = res.rows.map((row) => ({
      column: row.column_name,
      foreignTable: row.foreign_table_name,
      foreignColumn: row.foreign_column_name,
    }));

    expect(foreignKeys).toContainEqual({
      column: 'user_id',
      foreignTable: 'users',
      foreignColumn: 'id',
    });
    expect(foreignKeys).toContainEqual({
      column: 'exchange_rate_id',
      foreignTable: 'exchange_rates',
      foreignColumn: 'id',
    });
  });
});
