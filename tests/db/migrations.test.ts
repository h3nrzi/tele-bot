import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import pg from 'pg';
import dotenv from 'dotenv';
import { truncateAllTables } from '@tests/helpers/test-db';

dotenv.config();

const { Pool } = pg;

describe('Database Migrations', () => {
  const connectionString =
    process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/tele_bot_test';

  const pool = new Pool({ connectionString });

  beforeEach(async () => {
    await truncateAllTables(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('applies migrations before the test suite runs and creates users, wallets, exchange_rates, bank_accounts, top_up_requests, ledger_transactions, and ledger_entries tables', async () => {
    const res = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('users', 'wallets', 'exchange_rates', 'bank_accounts', 'top_up_requests', 'ledger_transactions', 'ledger_entries')
      ORDER BY table_name;
    `);

    const tableNames = res.rows.map((row) => row.table_name);
    expect(tableNames).toEqual([
      'bank_accounts',
      'exchange_rates',
      'ledger_entries',
      'ledger_transactions',
      'top_up_requests',
      'users',
      'wallets',
    ]);
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

  it('creates a partial unique index on top_up_requests(user_id) WHERE status IN (INITIATED, PENDING)', async () => {
    const res = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'top_up_requests'
        AND indexname = 'top_up_requests_user_id_active_idx';
    `);

    expect(res.rows).toHaveLength(1);
    const indexDef = res.rows[0]?.indexdef ?? '';
    expect(indexDef).toContain('UNIQUE INDEX top_up_requests_user_id_active_idx');
    expect(indexDef).toContain('user_id');
    expect(indexDef).toMatch(/WHERE.*status.*(INITIATED.*PENDING|'INITIATED'::top_up_status)/i);
  });

  it('enforces partial uniqueness: disallows multiple active (INITIATED/PENDING) requests per user but allows multiple inactive requests', async () => {
    // 1. Create test user and exchange rate
    const userRes = await pool.query(`
      INSERT INTO users (telegram_chat_id, telegram_username)
      VALUES (999000111, 'unique_test_user')
      RETURNING id;
    `);
    const userId = userRes.rows[0].id;

    const rateRes = await pool.query(`
      INSERT INTO exchange_rates (irr_per_usd, created_by_admin_telegram_id)
      VALUES (600000, 123456789)
      RETURNING id;
    `);
    const rateId = rateRes.rows[0].id;

    const futureExpiry = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    // 2. Insert first request with status INITIATED
    const req1Res = await pool.query(`
      INSERT INTO top_up_requests (user_id, exchange_rate_id, usd_amount, irr_amount, status, expires_at)
      VALUES ('${userId}', '${rateId}', 50.00, 30000000, 'INITIATED', '${futureExpiry}')
      RETURNING id;
    `);
    const req1Id = req1Res.rows[0].id;

    // 3. Attempting to insert a second INITIATED request for same user must fail with 23505 (unique violation)
    await expect(
      pool.query(`
        INSERT INTO top_up_requests (user_id, exchange_rate_id, usd_amount, irr_amount, status, expires_at)
        VALUES ('${userId}', '${rateId}', 100.00, 60000000, 'INITIATED', '${futureExpiry}')
      `)
    ).rejects.toMatchObject({ code: '23505' });

    // 4. Attempting to insert a second PENDING request for same user must also fail
    await expect(
      pool.query(`
        INSERT INTO top_up_requests (user_id, exchange_rate_id, usd_amount, irr_amount, status, expires_at)
        VALUES ('${userId}', '${rateId}', 100.00, 60000000, 'PENDING', '${futureExpiry}')
      `)
    ).rejects.toMatchObject({ code: '23505' });

    // 5. Update first request to APPROVED (terminal status)
    await pool.query(`
      UPDATE top_up_requests
      SET status = 'APPROVED'
      WHERE id = '${req1Id}'
    `);

    // 6. Now inserting a new INITIATED request for the same user must succeed
    const req2Res = await pool.query(`
      INSERT INTO top_up_requests (user_id, exchange_rate_id, usd_amount, irr_amount, status, expires_at)
      VALUES ('${userId}', '${rateId}', 75.00, 45000000, 'INITIATED', '${futureExpiry}')
      RETURNING id;
    `);
    expect(req2Res.rows[0].id).toBeDefined();
  });

  it('creates the ledger_account_type and ledger_entry_direction enums with required values', async () => {
    const accountTypeRes = await pool.query(`
      SELECT enumlabel
      FROM pg_enum
      JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
      WHERE pg_type.typname = 'ledger_account_type'
      ORDER BY enumsortorder;
    `);
    expect(accountTypeRes.rows.map((r) => r.enumlabel)).toEqual(['BUYER_WALLET', 'SYSTEM_CASH']);

    const directionRes = await pool.query(`
      SELECT enumlabel
      FROM pg_enum
      JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
      WHERE pg_type.typname = 'ledger_entry_direction'
      ORDER BY enumsortorder;
    `);
    expect(directionRes.rows.map((r) => r.enumlabel)).toEqual(['DEBIT', 'CREDIT']);
  });

  it('creates the ledger_transactions table with required columns and types', async () => {
    const res = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ledger_transactions'
      ORDER BY column_name;
    `);

    const columns = Object.fromEntries(
      res.rows.map((row) => [
        row.column_name,
        {
          type: row.data_type,
          nullable: row.is_nullable,
        },
      ])
    );

    expect(columns).toMatchObject({
      id: { type: 'uuid', nullable: 'NO' },
      top_up_request_id: { type: 'uuid', nullable: 'YES' },
      narrative: { type: 'text', nullable: 'NO' },
      created_at: { type: 'timestamp with time zone', nullable: 'NO' },
    });
  });

  it('creates the ledger_entries table with required columns, enums, and types', async () => {
    const res = await pool.query(`
      SELECT column_name, data_type, udt_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ledger_entries'
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
      ledger_transaction_id: { type: 'uuid', nullable: 'NO' },
      account_type: { type: 'USER-DEFINED', udtName: 'ledger_account_type', nullable: 'NO' },
      direction: { type: 'USER-DEFINED', udtName: 'ledger_entry_direction', nullable: 'NO' },
      usd_amount: { type: 'numeric', nullable: 'NO' },
      wallet_id: { type: 'uuid', nullable: 'YES' },
      created_at: { type: 'timestamp with time zone', nullable: 'NO' },
    });
  });

  it('creates foreign key constraints for ledger_transactions and ledger_entries', async () => {
    const res = await pool.query(`
      SELECT
        tc.table_name,
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
        AND tc.table_name IN ('ledger_transactions', 'ledger_entries');
    `);

    const foreignKeys = res.rows.map((row) => ({
      tableName: row.table_name,
      column: row.column_name,
      foreignTable: row.foreign_table_name,
      foreignColumn: row.foreign_column_name,
    }));

    expect(foreignKeys).toContainEqual({
      tableName: 'ledger_transactions',
      column: 'top_up_request_id',
      foreignTable: 'top_up_requests',
      foreignColumn: 'id',
    });
    expect(foreignKeys).toContainEqual({
      tableName: 'ledger_entries',
      column: 'ledger_transaction_id',
      foreignTable: 'ledger_transactions',
      foreignColumn: 'id',
    });
    expect(foreignKeys).toContainEqual({
      tableName: 'ledger_entries',
      column: 'wallet_id',
      foreignTable: 'wallets',
      foreignColumn: 'id',
    });
  });
});
