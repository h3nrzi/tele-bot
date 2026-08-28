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
    `);
    const tableNames = res.rows.map((row) => row.table_name);

    expect(tableNames).toContain('users');
    expect(tableNames).toContain('wallets');
    expect(tableNames).toContain('exchange_rates');
    expect(tableNames).toContain('bank_accounts');
    expect(tableNames).toContain('top_up_requests');
    expect(tableNames).toContain('ledger_transactions');
    expect(tableNames).toContain('ledger_entries');
  });

  it('creates the users table with the required columns and types', async () => {
    const res = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users'
    `);
    const cols = Object.fromEntries(
      res.rows.map((r) => [r.column_name, { type: r.data_type, nullable: r.is_nullable }])
    );

    expect(cols['id']).toEqual({ type: 'uuid', nullable: 'NO' });
    expect(cols['telegram_chat_id']).toEqual({ type: 'bigint', nullable: 'NO' });
    expect(cols['telegram_username']).toEqual({ type: 'character varying', nullable: 'YES' });
    expect(cols['created_at']).toEqual({ type: 'timestamp with time zone', nullable: 'NO' });
  });

  it('creates the wallets table with the required columns and types', async () => {
    const res = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'wallets'
    `);
    const cols = Object.fromEntries(
      res.rows.map((r) => [r.column_name, { type: r.data_type, nullable: r.is_nullable }])
    );

    expect(cols['id']).toEqual({ type: 'uuid', nullable: 'NO' });
    expect(cols['user_id']).toEqual({ type: 'uuid', nullable: 'NO' });
    expect(cols['available_balance']).toEqual({ type: 'numeric', nullable: 'NO' });
    expect(cols['updated_at']).toEqual({ type: 'timestamp with time zone', nullable: 'NO' });
  });

  it('creates the exchange_rates table with the required columns and types', async () => {
    const res = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'exchange_rates'
    `);
    const cols = Object.fromEntries(
      res.rows.map((r) => [r.column_name, { type: r.data_type, nullable: r.is_nullable }])
    );

    expect(cols['id']).toEqual({ type: 'uuid', nullable: 'NO' });
    expect(cols['irr_per_usd']).toEqual({ type: 'bigint', nullable: 'NO' });
    expect(cols['created_by_admin_telegram_id']).toEqual({ type: 'bigint', nullable: 'NO' });
    expect(cols['created_at']).toEqual({ type: 'timestamp with time zone', nullable: 'NO' });
  });

  it('creates the bank_accounts table with the required columns and types', async () => {
    const res = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'bank_accounts'
    `);
    const cols = Object.fromEntries(
      res.rows.map((r) => [r.column_name, { type: r.data_type, nullable: r.is_nullable }])
    );

    expect(cols['id']).toEqual({ type: 'uuid', nullable: 'NO' });
    expect(cols['card_number']).toEqual({ type: 'character varying', nullable: 'NO' });
    expect(cols['card_holder_name']).toEqual({ type: 'character varying', nullable: 'NO' });
    expect(cols['bank_name']).toEqual({ type: 'character varying', nullable: 'NO' });
    expect(cols['additional_notes']).toEqual({ type: 'text', nullable: 'YES' });
    expect(cols['is_active']).toEqual({ type: 'boolean', nullable: 'NO' });
    expect(cols['created_at']).toEqual({ type: 'timestamp with time zone', nullable: 'NO' });
  });

  it('creates the top_up_status enum with all required lifecycle values', async () => {
    const res = await pool.query(`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = 'top_up_status'
      ORDER BY e.enumsortorder
    `);
    const enumLabels = res.rows.map((row) => row.enumlabel);

    expect(enumLabels).toEqual([
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
      WHERE table_name = 'top_up_requests'
    `);
    const cols = Object.fromEntries(
      res.rows.map((r) => [
        r.column_name,
        { type: r.data_type, udt: r.udt_name, nullable: r.is_nullable },
      ])
    );

    expect(cols['id']).toEqual({ type: 'uuid', udt: 'uuid', nullable: 'NO' });
    expect(cols['user_id']).toEqual({ type: 'uuid', udt: 'uuid', nullable: 'NO' });
    expect(cols['usd_amount']).toEqual({ type: 'numeric', udt: 'numeric', nullable: 'NO' });
    expect(cols['irr_amount']).toEqual({ type: 'bigint', udt: 'int8', nullable: 'NO' });
    expect(cols['exchange_rate_id']).toEqual({ type: 'uuid', udt: 'uuid', nullable: 'NO' });
    expect(cols['status']).toEqual({
      type: 'USER-DEFINED',
      udt: 'top_up_status',
      nullable: 'NO',
    });
    expect(cols['receipt_file_id']).toEqual({
      type: 'character varying',
      udt: 'varchar',
      nullable: 'YES',
    });
    expect(cols['receipt_caption']).toEqual({
      type: 'text',
      udt: 'text',
      nullable: 'YES',
    });
    expect(cols['rejection_reason']).toEqual({
      type: 'text',
      udt: 'text',
      nullable: 'YES',
    });
    expect(cols['expires_at']).toEqual({
      type: 'timestamp with time zone',
      udt: 'timestamptz',
      nullable: 'NO',
    });
    expect(cols['processed_by_admin_telegram_id']).toEqual({
      type: 'bigint',
      udt: 'int8',
      nullable: 'YES',
    });
    expect(cols['processed_at']).toEqual({
      type: 'timestamp with time zone',
      udt: 'timestamptz',
      nullable: 'YES',
    });
    expect(cols['created_at']).toEqual({
      type: 'timestamp with time zone',
      udt: 'timestamptz',
      nullable: 'NO',
    });
    expect(cols['updated_at']).toEqual({
      type: 'timestamp with time zone',
      udt: 'timestamptz',
      nullable: 'NO',
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
        AND tc.table_name = 'top_up_requests'
    `);

    const fks = Object.fromEntries(
      res.rows.map((r) => [r.column_name, { table: r.foreign_table_name, col: r.foreign_column_name }])
    );

    expect(fks['user_id']).toEqual({ table: 'users', col: 'id' });
    expect(fks['exchange_rate_id']).toEqual({ table: 'exchange_rates', col: 'id' });
  });

  it('enforces partial uniqueness: disallows multiple active (INITIATED/PENDING) requests per user but allows multiple inactive requests', async () => {
    // 1. Insert prerequisites: user and exchange rate
    const userRes = await pool.query(`
      INSERT INTO users (telegram_chat_id, telegram_username)
      VALUES (123456789, 'testuser')
      RETURNING id
    `);
    const userId = userRes.rows[0].id;

    const rateRes = await pool.query(`
      INSERT INTO exchange_rates (irr_per_usd, created_by_admin_telegram_id)
      VALUES (600000, 987654321)
      RETURNING id
    `);
    const rateId = rateRes.rows[0].id;

    // 2. Insert first INITIATED request (should succeed)
    await pool.query(`
      INSERT INTO top_up_requests (user_id, usd_amount, irr_amount, exchange_rate_id, status, expires_at)
      VALUES ('${userId}', 100.00, 60000000, '${rateId}', 'INITIATED', NOW() + INTERVAL '30 minutes')
    `);

    // 3. Insert second INITIATED request for same user (must fail due to partial unique index)
    await expect(
      pool.query(`
        INSERT INTO top_up_requests (user_id, usd_amount, irr_amount, exchange_rate_id, status, expires_at)
        VALUES ('${userId}', 50.00, 30000000, '${rateId}', 'INITIATED', NOW() + INTERVAL '30 minutes')
      `)
    ).rejects.toThrow();

    // 4. Update the first request to CANCELLED (inactive)
    await pool.query(`
      UPDATE top_up_requests
      SET status = 'CANCELLED'
      WHERE user_id = '${userId}'
    `);

    // 5. Now inserting another INITIATED request should succeed
    const newReqRes = await pool.query(`
      INSERT INTO top_up_requests (user_id, usd_amount, irr_amount, exchange_rate_id, status, expires_at)
      VALUES ('${userId}', 75.00, 45000000, '${rateId}', 'INITIATED', NOW() + INTERVAL '30 minutes')
      RETURNING id
    `);
    expect(newReqRes.rows[0]?.id).toBeDefined();

    // 6. Transition to PENDING (still active)
    await pool.query(`
      UPDATE top_up_requests
      SET status = 'PENDING', receipt_file_id = 'file_123'
      WHERE id = '${newReqRes.rows[0].id}'
    `);

    // 7. Inserting another active request while one is PENDING must fail
    await expect(
      pool.query(`
        INSERT INTO top_up_requests (user_id, usd_amount, irr_amount, exchange_rate_id, status, expires_at)
        VALUES ('${userId}', 25.00, 15000000, '${rateId}', 'INITIATED', NOW() + INTERVAL '30 minutes')
      `)
    ).rejects.toThrow();
  });

  it('creates the ledger_account_type and ledger_entry_direction enums with required values', async () => {
    const accountTypesRes = await pool.query(`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = 'ledger_account_type'
      ORDER BY e.enumsortorder
    `);
    expect(accountTypesRes.rows.map((r) => r.enumlabel)).toEqual(['BUYER_WALLET', 'SYSTEM_CASH']);

    const directionsRes = await pool.query(`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = 'ledger_entry_direction'
      ORDER BY e.enumsortorder
    `);
    expect(directionsRes.rows.map((r) => r.enumlabel)).toEqual(['DEBIT', 'CREDIT']);
  });

  it('creates the ledger_transactions table with required columns and types', async () => {
    const res = await pool.query(`
      SELECT column_name, data_type, udt_name, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'ledger_transactions'
    `);
    const cols = Object.fromEntries(
      res.rows.map((r) => [
        r.column_name,
        { type: r.data_type, udt: r.udt_name, nullable: r.is_nullable },
      ])
    );

    expect(cols['id']).toEqual({ type: 'uuid', udt: 'uuid', nullable: 'NO' });
    expect(cols['top_up_request_id']).toEqual({
      type: 'uuid',
      udt: 'uuid',
      nullable: 'YES',
    });
    expect(cols['narrative']).toEqual({
      type: 'text',
      udt: 'text',
      nullable: 'NO',
    });
    expect(cols['created_at']).toEqual({
      type: 'timestamp with time zone',
      udt: 'timestamptz',
      nullable: 'NO',
    });
  });

  it('creates the ledger_entries table with required columns, enums, and types', async () => {
    const res = await pool.query(`
      SELECT column_name, data_type, udt_name, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'ledger_entries'
    `);
    const cols = Object.fromEntries(
      res.rows.map((r) => [
        r.column_name,
        { type: r.data_type, udt: r.udt_name, nullable: r.is_nullable },
      ])
    );

    expect(cols['id']).toEqual({ type: 'uuid', udt: 'uuid', nullable: 'NO' });
    expect(cols['ledger_transaction_id']).toEqual({
      type: 'uuid',
      udt: 'uuid',
      nullable: 'NO',
    });
    expect(cols['account_type']).toEqual({
      type: 'USER-DEFINED',
      udt: 'ledger_account_type',
      nullable: 'NO',
    });
    expect(cols['direction']).toEqual({
      type: 'USER-DEFINED',
      udt: 'ledger_entry_direction',
      nullable: 'NO',
    });
    expect(cols['usd_amount']).toEqual({
      type: 'numeric',
      udt: 'numeric',
      nullable: 'NO',
    });
    expect(cols['wallet_id']).toEqual({
      type: 'uuid',
      udt: 'uuid',
      nullable: 'YES',
    });
    expect(cols['created_at']).toEqual({
      type: 'timestamp with time zone',
      udt: 'timestamptz',
      nullable: 'NO',
    });
  });

  it('creates foreign key constraints for ledger_transactions and ledger_entries', async () => {
    const txFks = await pool.query(`
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
        AND tc.table_name = 'ledger_transactions'
    `);
    const txFkMap = Object.fromEntries(
      txFks.rows.map((r) => [r.column_name, { table: r.foreign_table_name, col: r.foreign_column_name }])
    );
    expect(txFkMap['top_up_request_id']).toEqual({ table: 'top_up_requests', col: 'id' });

    const entryFks = await pool.query(`
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
        AND tc.table_name = 'ledger_entries'
    `);
    const entryFkMap = Object.fromEntries(
      entryFks.rows.map((r) => [r.column_name, { table: r.foreign_table_name, col: r.foreign_column_name }])
    );
    expect(entryFkMap['ledger_transaction_id']).toEqual({ table: 'ledger_transactions', col: 'id' });
    expect(entryFkMap['wallet_id']).toEqual({ table: 'wallets', col: 'id' });
  });
});
