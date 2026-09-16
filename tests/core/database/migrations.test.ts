import { describe, it, expect, afterAll, beforeEach } from "vitest";
import pg from "pg";
import dotenv from "dotenv";
import { truncateAllTables } from "@tests/helpers/test-db";

dotenv.config();

const { Pool } = pg;

describe("Database Migrations", () => {
	const connectionString =
		process.env.TEST_DATABASE_URL ||
		process.env.DATABASE_URL ||
		"postgres://postgres:postgres@localhost:5432/tele_bot_test";

	const pool = new Pool({ connectionString });

	beforeEach(async () => {
		await truncateAllTables(pool);
	});

	afterAll(async () => {
		await pool.end();
	});

	it("applies migrations before the test suite runs and creates users, wallets, exchange_rates, bank_accounts, top_up_requests, ledger_transactions, ledger_entries, catalog_items, orders, and order_admin_notifications tables", async () => {
		const res = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);
		const tableNames = res.rows.map((row) => row.table_name);

		expect(tableNames).toContain("users");
		expect(tableNames).toContain("wallets");
		expect(tableNames).toContain("exchange_rates");
		expect(tableNames).toContain("bank_accounts");
		expect(tableNames).toContain("top_up_requests");
		expect(tableNames).toContain("ledger_transactions");
		expect(tableNames).toContain("ledger_entries");
		expect(tableNames).toContain("catalog_items");
		expect(tableNames).toContain("orders");
		expect(tableNames).toContain("order_admin_notifications");
		expect(tableNames).toContain("exchange_rate_config");
		expect(tableNames).toContain("wallex_otc_purchases");
	});

	it("creates the users table with the required columns and types", async () => {
		const res = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users'
    `);
		const cols = Object.fromEntries(
			res.rows.map((r) => [r.column_name, { type: r.data_type, nullable: r.is_nullable }]),
		);

		expect(cols["id"]).toEqual({ type: "uuid", nullable: "NO" });
		expect(cols["telegram_chat_id"]).toEqual({
			type: "bigint",
			nullable: "NO",
		});
		expect(cols["telegram_username"]).toEqual({
			type: "character varying",
			nullable: "YES",
		});
		expect(cols["created_at"]).toEqual({
			type: "timestamp with time zone",
			nullable: "NO",
		});
	});

	it("creates the wallets table with the required columns and types", async () => {
		const res = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'wallets'
    `);
		const cols = Object.fromEntries(
			res.rows.map((r) => [r.column_name, { type: r.data_type, nullable: r.is_nullable }]),
		);

		expect(cols["id"]).toEqual({ type: "uuid", nullable: "NO" });
		expect(cols["user_id"]).toEqual({ type: "uuid", nullable: "NO" });
		expect(cols["available_balance"]).toEqual({
			type: "numeric",
			nullable: "NO",
		});
		expect(cols["updated_at"]).toEqual({
			type: "timestamp with time zone",
			nullable: "NO",
		});
	});

	it("creates the exchange_rates table with the required columns and types", async () => {
		const res = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'exchange_rates'
    `);
		const cols = Object.fromEntries(
			res.rows.map((r) => [r.column_name, { type: r.data_type, nullable: r.is_nullable }]),
		);

		expect(cols["id"]).toEqual({ type: "uuid", nullable: "NO" });
		expect(cols["irr_per_usd"]).toEqual({ type: "bigint", nullable: "NO" });
		expect(cols["created_by_admin_telegram_id"]).toEqual({
			type: "bigint",
			nullable: "NO",
		});
		expect(cols["created_at"]).toEqual({
			type: "timestamp with time zone",
			nullable: "NO",
		});
	});

	it("creates the bank_accounts table with the required columns and types", async () => {
		const res = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'bank_accounts'
    `);
		const cols = Object.fromEntries(
			res.rows.map((r) => [r.column_name, { type: r.data_type, nullable: r.is_nullable }]),
		);

		expect(cols["id"]).toEqual({ type: "uuid", nullable: "NO" });
		expect(cols["card_number"]).toEqual({
			type: "character varying",
			nullable: "NO",
		});
		expect(cols["card_holder_name"]).toEqual({
			type: "character varying",
			nullable: "NO",
		});
		expect(cols["bank_name"]).toEqual({
			type: "character varying",
			nullable: "NO",
		});
		expect(cols["additional_notes"]).toEqual({ type: "text", nullable: "YES" });
		expect(cols["is_active"]).toEqual({ type: "boolean", nullable: "NO" });
		expect(cols["created_at"]).toEqual({
			type: "timestamp with time zone",
			nullable: "NO",
		});
	});

	it("creates the top_up_status enum with all required lifecycle values", async () => {
		const res = await pool.query(`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = 'top_up_status'
      ORDER BY e.enumsortorder
    `);
		const enumLabels = res.rows.map((row) => row.enumlabel);

		expect(enumLabels).toEqual(["INITIATED", "PENDING", "APPROVED", "REJECTED", "EXPIRED", "CANCELLED"]);
	});

	it("creates the top_up_requests table with the required columns and types", async () => {
		const res = await pool.query(`
      SELECT column_name, data_type, udt_name, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'top_up_requests'
    `);
		const cols = Object.fromEntries(
			res.rows.map((r) => [r.column_name, { type: r.data_type, udt: r.udt_name, nullable: r.is_nullable }]),
		);

		expect(cols["id"]).toEqual({ type: "uuid", udt: "uuid", nullable: "NO" });
		expect(cols["user_id"]).toEqual({
			type: "uuid",
			udt: "uuid",
			nullable: "NO",
		});
		expect(cols["usd_amount"]).toEqual({
			type: "numeric",
			udt: "numeric",
			nullable: "NO",
		});
		expect(cols["irr_amount"]).toEqual({
			type: "bigint",
			udt: "int8",
			nullable: "NO",
		});
		expect(cols["exchange_rate_id"]).toEqual({
			type: "uuid",
			udt: "uuid",
			nullable: "YES",
		});
		expect(cols["locked_irr_per_usd"]).toEqual({
			type: "bigint",
			udt: "int8",
			nullable: "NO",
		});
		expect(cols["rate_source"]).toEqual({
			type: "character varying",
			udt: "varchar",
			nullable: "NO",
		});
		expect(cols["status"]).toEqual({
			type: "USER-DEFINED",
			udt: "top_up_status",
			nullable: "NO",
		});
		expect(cols["receipt_file_id"]).toEqual({
			type: "character varying",
			udt: "varchar",
			nullable: "YES",
		});
		expect(cols["receipt_caption"]).toEqual({
			type: "text",
			udt: "text",
			nullable: "YES",
		});
		expect(cols["rejection_reason"]).toEqual({
			type: "text",
			udt: "text",
			nullable: "YES",
		});
		expect(cols["expires_at"]).toEqual({
			type: "timestamp with time zone",
			udt: "timestamptz",
			nullable: "NO",
		});
		expect(cols["processed_by_admin_telegram_id"]).toEqual({
			type: "bigint",
			udt: "int8",
			nullable: "YES",
		});
		expect(cols["processed_at"]).toEqual({
			type: "timestamp with time zone",
			udt: "timestamptz",
			nullable: "YES",
		});
		expect(cols["created_at"]).toEqual({
			type: "timestamp with time zone",
			udt: "timestamptz",
			nullable: "NO",
		});
		expect(cols["updated_at"]).toEqual({
			type: "timestamp with time zone",
			udt: "timestamptz",
			nullable: "NO",
		});
	});

	it("creates foreign key constraints for top_up_requests", async () => {
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
			res.rows.map((r) => [r.column_name, { table: r.foreign_table_name, col: r.foreign_column_name }]),
		);

		expect(fks["user_id"]).toEqual({ table: "users", col: "id" });
		expect(fks["exchange_rate_id"]).toEqual({
			table: "exchange_rates",
			col: "id",
		});
	});

	it("enforces partial uniqueness: disallows multiple active (INITIATED/PENDING) requests per user but allows multiple inactive requests", async () => {
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
      INSERT INTO top_up_requests (user_id, usd_amount, irr_amount, exchange_rate_id, locked_irr_per_usd, rate_source, status, expires_at)
      VALUES ('${userId}', 100.00, 60000000, '${rateId}', 600000, 'MANUAL', 'INITIATED', NOW() + INTERVAL '30 minutes')
    `);

		// 3. Insert second INITIATED request for same user (must fail due to partial unique index)
		await expect(
			pool.query(`
        INSERT INTO top_up_requests (user_id, usd_amount, irr_amount, exchange_rate_id, locked_irr_per_usd, rate_source, status, expires_at)
        VALUES ('${userId}', 50.00, 30000000, '${rateId}', 600000, 'MANUAL', 'INITIATED', NOW() + INTERVAL '30 minutes')
      `),
		).rejects.toThrow();

		// 4. Update the first request to CANCELLED (inactive)
		await pool.query(`
      UPDATE top_up_requests
      SET status = 'CANCELLED'
      WHERE user_id = '${userId}'
    `);

		// 5. Now inserting another INITIATED request should succeed
		const newReqRes = await pool.query(`
      INSERT INTO top_up_requests (user_id, usd_amount, irr_amount, exchange_rate_id, locked_irr_per_usd, rate_source, status, expires_at)
      VALUES ('${userId}', 75.00, 45000000, '${rateId}', 600000, 'MANUAL', 'INITIATED', NOW() + INTERVAL '30 minutes')
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
        INSERT INTO top_up_requests (user_id, usd_amount, irr_amount, exchange_rate_id, locked_irr_per_usd, rate_source, status, expires_at)
        VALUES ('${userId}', 25.00, 15000000, '${rateId}', 600000, 'MANUAL', 'INITIATED', NOW() + INTERVAL '30 minutes')
      `),
		).rejects.toThrow();
	});

	it("creates the ledger_account_type and ledger_entry_direction enums with required values", async () => {
		const accountTypesRes = await pool.query(`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = 'ledger_account_type'
      ORDER BY e.enumsortorder
    `);
		expect(accountTypesRes.rows.map((r) => r.enumlabel)).toEqual(["BUYER_WALLET", "SYSTEM_CASH"]);

		const directionsRes = await pool.query(`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = 'ledger_entry_direction'
      ORDER BY e.enumsortorder
    `);
		expect(directionsRes.rows.map((r) => r.enumlabel)).toEqual(["DEBIT", "CREDIT"]);
	});

	it("creates the ledger_transactions table with required columns and types", async () => {
		const res = await pool.query(`
      SELECT column_name, data_type, udt_name, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'ledger_transactions'
    `);
		const cols = Object.fromEntries(
			res.rows.map((r) => [r.column_name, { type: r.data_type, udt: r.udt_name, nullable: r.is_nullable }]),
		);

		expect(cols["id"]).toEqual({ type: "uuid", udt: "uuid", nullable: "NO" });
		expect(cols["top_up_request_id"]).toEqual({
			type: "uuid",
			udt: "uuid",
			nullable: "YES",
		});
		expect(cols["narrative"]).toEqual({
			type: "text",
			udt: "text",
			nullable: "NO",
		});
		expect(cols["created_at"]).toEqual({
			type: "timestamp with time zone",
			udt: "timestamptz",
			nullable: "NO",
		});
	});

	it("creates the ledger_entries table with required columns, enums, and types", async () => {
		const res = await pool.query(`
      SELECT column_name, data_type, udt_name, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'ledger_entries'
    `);
		const cols = Object.fromEntries(
			res.rows.map((r) => [r.column_name, { type: r.data_type, udt: r.udt_name, nullable: r.is_nullable }]),
		);

		expect(cols["id"]).toEqual({ type: "uuid", udt: "uuid", nullable: "NO" });
		expect(cols["ledger_transaction_id"]).toEqual({
			type: "uuid",
			udt: "uuid",
			nullable: "NO",
		});
		expect(cols["account_type"]).toEqual({
			type: "USER-DEFINED",
			udt: "ledger_account_type",
			nullable: "NO",
		});
		expect(cols["direction"]).toEqual({
			type: "USER-DEFINED",
			udt: "ledger_entry_direction",
			nullable: "NO",
		});
		expect(cols["usd_amount"]).toEqual({
			type: "numeric",
			udt: "numeric",
			nullable: "NO",
		});
		expect(cols["wallet_id"]).toEqual({
			type: "uuid",
			udt: "uuid",
			nullable: "YES",
		});
		expect(cols["created_at"]).toEqual({
			type: "timestamp with time zone",
			udt: "timestamptz",
			nullable: "NO",
		});
	});

	it("creates foreign key constraints for ledger_transactions and ledger_entries", async () => {
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
			txFks.rows.map((r) => [r.column_name, { table: r.foreign_table_name, col: r.foreign_column_name }]),
		);
		expect(txFkMap["top_up_request_id"]).toEqual({
			table: "top_up_requests",
			col: "id",
		});

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
			entryFks.rows.map((r) => [r.column_name, { table: r.foreign_table_name, col: r.foreign_column_name }]),
		);
		expect(entryFkMap["ledger_transaction_id"]).toEqual({
			table: "ledger_transactions",
			col: "id",
		});
		expect(entryFkMap["wallet_id"]).toEqual({ table: "wallets", col: "id" });
	});

	it("creates the catalog_items table with the required columns, types, and defaults", async () => {
		const res = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'catalog_items'
    `);
		const cols = Object.fromEntries(
			res.rows.map((r) => [
				r.column_name,
				{
					type: r.data_type,
					nullable: r.is_nullable,
					default: r.column_default,
				},
			]),
		);

		expect(cols["id"]).toBeDefined();
		expect(cols["id"].type).toBe("uuid");
		expect(cols["id"].nullable).toBe("NO");

		expect(cols["name"]).toEqual({
			type: "character varying",
			nullable: "NO",
			default: null,
		});
		expect(cols["description"]).toEqual({
			type: "text",
			nullable: "YES",
			default: null,
		});
		expect(cols["usd_price"]).toEqual({
			type: "numeric",
			nullable: "NO",
			default: null,
		});
		expect(cols["is_active"].type).toBe("boolean");
		expect(cols["is_active"].nullable).toBe("NO");
		expect(cols["created_at"].type).toBe("timestamp with time zone");
		expect(cols["created_at"].nullable).toBe("NO");
		expect(cols["updated_at"].type).toBe("timestamp with time zone");
		expect(cols["updated_at"].nullable).toBe("NO");
	});

	it("creates the order_status enum with all required lifecycle values", async () => {
		const res = await pool.query(`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = 'order_status'
      ORDER BY e.enumsortorder
    `);
		const enumLabels = res.rows.map((row) => row.enumlabel);

		expect(enumLabels).toEqual(["PLACED", "PROCESSING", "FULFILLED", "REJECTED", "CANCELLED"]);
	});

	it("creates the orders table with all status-lifecycle columns, types, and foreign keys", async () => {
		const res = await pool.query(`
      SELECT column_name, data_type, udt_name, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'orders'
    `);
		const cols = Object.fromEntries(
			res.rows.map((r) => [r.column_name, { type: r.data_type, udt: r.udt_name, nullable: r.is_nullable }]),
		);

		expect(cols["id"]).toEqual({ type: "uuid", udt: "uuid", nullable: "NO" });
		expect(cols["user_id"]).toEqual({
			type: "uuid",
			udt: "uuid",
			nullable: "NO",
		});
		expect(cols["catalog_item_id"]).toEqual({
			type: "uuid",
			udt: "uuid",
			nullable: "NO",
		});
		expect(cols["usd_price_snapshot"]).toEqual({
			type: "numeric",
			udt: "numeric",
			nullable: "NO",
		});
		expect(cols["status"]).toEqual({
			type: "USER-DEFINED",
			udt: "order_status",
			nullable: "NO",
		});
		expect(cols["delivery_content"]).toEqual({
			type: "text",
			udt: "text",
			nullable: "YES",
		});
		expect(cols["rejection_category"]).toEqual({
			type: "character varying",
			udt: "varchar",
			nullable: "YES",
		});
		expect(cols["rejection_note"]).toEqual({
			type: "text",
			udt: "text",
			nullable: "YES",
		});
		expect(cols["claimed_by_admin_telegram_id"]).toEqual({
			type: "bigint",
			udt: "int8",
			nullable: "YES",
		});
		expect(cols["claimed_at"]).toEqual({
			type: "timestamp with time zone",
			udt: "timestamptz",
			nullable: "YES",
		});
		expect(cols["fulfilled_at"]).toEqual({
			type: "timestamp with time zone",
			udt: "timestamptz",
			nullable: "YES",
		});
		expect(cols["rejected_at"]).toEqual({
			type: "timestamp with time zone",
			udt: "timestamptz",
			nullable: "YES",
		});
		expect(cols["cancelled_at"]).toEqual({
			type: "timestamp with time zone",
			udt: "timestamptz",
			nullable: "YES",
		});
		expect(cols["created_at"]).toEqual({
			type: "timestamp with time zone",
			udt: "timestamptz",
			nullable: "NO",
		});
		expect(cols["updated_at"]).toEqual({
			type: "timestamp with time zone",
			udt: "timestamptz",
			nullable: "NO",
		});

		const fks = await pool.query(`
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
        AND tc.table_name = 'orders'
    `);
		const fkMap = Object.fromEntries(
			fks.rows.map((r) => [r.column_name, { table: r.foreign_table_name, col: r.foreign_column_name }]),
		);
		expect(fkMap["user_id"]).toEqual({ table: "users", col: "id" });
		expect(fkMap["catalog_item_id"]).toEqual({
			table: "catalog_items",
			col: "id",
		});
	});

	it("creates the order_admin_notifications table with required columns and foreign keys", async () => {
		const res = await pool.query(`
      SELECT column_name, data_type, udt_name, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'order_admin_notifications'
    `);
		const cols = Object.fromEntries(
			res.rows.map((r) => [r.column_name, { type: r.data_type, udt: r.udt_name, nullable: r.is_nullable }]),
		);

		expect(cols["id"]).toEqual({ type: "uuid", udt: "uuid", nullable: "NO" });
		expect(cols["order_id"]).toEqual({
			type: "uuid",
			udt: "uuid",
			nullable: "NO",
		});
		expect(cols["admin_telegram_id"]).toEqual({
			type: "bigint",
			udt: "int8",
			nullable: "NO",
		});
		expect(cols["chat_id"]).toEqual({
			type: "bigint",
			udt: "int8",
			nullable: "NO",
		});
		expect(cols["message_id"]).toEqual({
			type: "bigint",
			udt: "int8",
			nullable: "NO",
		});
		expect(cols["created_at"]).toEqual({
			type: "timestamp with time zone",
			udt: "timestamptz",
			nullable: "NO",
		});

		const fks = await pool.query(`
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
        AND tc.table_name = 'order_admin_notifications'
    `);
		const fkMap = Object.fromEntries(
			fks.rows.map((r) => [r.column_name, { table: r.foreign_table_name, col: r.foreign_column_name }]),
		);
		expect(fkMap["order_id"]).toEqual({ table: "orders", col: "id" });
	});

	it("amends ledger_transactions with order_id, reversed_by_ledger_transaction_id FKs and enforces the XOR CHECK constraint", async () => {
		const res = await pool.query(`
      SELECT column_name, data_type, udt_name, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'ledger_transactions'
    `);
		const cols = Object.fromEntries(
			res.rows.map((r) => [r.column_name, { type: r.data_type, udt: r.udt_name, nullable: r.is_nullable }]),
		);

		expect(cols["order_id"]).toEqual({
			type: "uuid",
			udt: "uuid",
			nullable: "YES",
		});
		expect(cols["reversed_by_ledger_transaction_id"]).toEqual({
			type: "uuid",
			udt: "uuid",
			nullable: "YES",
		});

		const fks = await pool.query(`
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
		const fkMap = Object.fromEntries(
			fks.rows.map((r) => [r.column_name, { table: r.foreign_table_name, col: r.foreign_column_name }]),
		);
		expect(fkMap["order_id"]).toEqual({ table: "orders", col: "id" });
		expect(fkMap["reversed_by_ledger_transaction_id"]).toEqual({
			table: "ledger_transactions",
			col: "id",
		});

		// Test XOR check constraint
		// 1. Insert prerequisites
		const userRes = await pool.query(`
      INSERT INTO users (telegram_chat_id, telegram_username)
      VALUES (999888777, 'xor_user')
      RETURNING id
    `);
		const userId = userRes.rows[0].id;

		const rateRes = await pool.query(`
      INSERT INTO exchange_rates (irr_per_usd, created_by_admin_telegram_id)
      VALUES (600000, 111)
      RETURNING id
    `);
		const rateId = rateRes.rows[0].id;

		const topUpRes = await pool.query(`
      INSERT INTO top_up_requests (user_id, usd_amount, irr_amount, exchange_rate_id, locked_irr_per_usd, rate_source, status, expires_at)
      VALUES ('${userId}', 50.00, 30000000, '${rateId}', 600000, 'MANUAL', 'APPROVED', NOW() + INTERVAL '30 minutes')
      RETURNING id
    `);
		const topUpId = topUpRes.rows[0].id;

		const itemRes = await pool.query(`
      INSERT INTO catalog_items (name, usd_price)
      VALUES ('Test Item', 10.00)
      RETURNING id
    `);
		const itemId = itemRes.rows[0].id;

		const orderRes = await pool.query(`
      INSERT INTO orders (user_id, catalog_item_id, usd_price_snapshot, status)
      VALUES ('${userId}', '${itemId}', 10.00, 'PLACED')
      RETURNING id
    `);
		const orderId = orderRes.rows[0].id;

		// Both NULL must fail
		await expect(
			pool.query(`
        INSERT INTO ledger_transactions (top_up_request_id, order_id, narrative)
        VALUES (NULL, NULL, 'Both null')
      `),
		).rejects.toThrow();

		// Both non-NULL must fail
		await expect(
			pool.query(`
        INSERT INTO ledger_transactions (top_up_request_id, order_id, narrative)
        VALUES ('${topUpId}', '${orderId}', 'Both set')
      `),
		).rejects.toThrow();

		// Only top_up_request_id set must succeed
		const txTopUp = await pool.query(`
      INSERT INTO ledger_transactions (top_up_request_id, order_id, narrative)
      VALUES ('${topUpId}', NULL, 'Top up tx')
      RETURNING id
    `);
		expect(txTopUp.rows[0]?.id).toBeDefined();

		// Only order_id set must succeed
		const txOrder = await pool.query(`
      INSERT INTO ledger_transactions (top_up_request_id, order_id, narrative)
      VALUES (NULL, '${orderId}', 'Order tx')
      RETURNING id
    `);
		expect(txOrder.rows[0]?.id).toBeDefined();

		// Self-referential reversal link update must succeed
		await expect(
			pool.query(`
        UPDATE ledger_transactions
        SET reversed_by_ledger_transaction_id = '${txTopUp.rows[0].id}'
        WHERE id = '${txOrder.rows[0].id}'
      `),
		).resolves.toBeDefined();
	});

	it("creates the rate_mode enum with all required values", async () => {
		const res = await pool.query(`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = 'rate_mode'
      ORDER BY e.enumsortorder
    `);
		const enumLabels = res.rows.map((row) => row.enumlabel);

		expect(enumLabels).toEqual(["MANUAL", "AUTO_SYNC"]);
	});

	it("creates the exchange_rate_config table with required columns, types, defaults, and spread check", async () => {
		const res = await pool.query(`
      SELECT column_name, data_type, udt_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'exchange_rate_config'
    `);
		const cols = Object.fromEntries(
			res.rows.map((r) => [
				r.column_name,
				{
					type: r.data_type,
					udt: r.udt_name,
					nullable: r.is_nullable,
					default: r.column_default,
				},
			]),
		);

		expect(cols["id"]).toEqual({
			type: "uuid",
			udt: "uuid",
			nullable: "NO",
			default: "gen_random_uuid()",
		});
		expect(cols["mode"]).toEqual({
			type: "USER-DEFINED",
			udt: "rate_mode",
			nullable: "NO",
			default: "'MANUAL'::rate_mode",
		});
		expect(cols["spread_percent"]).toEqual({
			type: "numeric",
			udt: "numeric",
			nullable: "NO",
			default: "0.00",
		});
		expect(cols["sync_interval_minutes"]).toEqual({
			type: "integer",
			udt: "int4",
			nullable: "NO",
			default: "60",
		});
		expect(cols["updated_by_admin_telegram_id"]).toEqual({
			type: "bigint",
			udt: "int8",
			nullable: "YES",
			default: null,
		});
		expect(cols["created_at"].nullable).toBe("NO");
		expect(cols["updated_at"].nullable).toBe("NO");

		// Test spread check constraint (0 <= spread <= 10)
		// Valid spread: 5.00
		await expect(
			pool.query(`
        INSERT INTO exchange_rate_config (mode, spread_percent, sync_interval_minutes)
        VALUES ('MANUAL', 5.00, 60)
      `),
		).resolves.toBeDefined();

		// Invalid spread: -1 (must fail)
		await expect(
			pool.query(`
        INSERT INTO exchange_rate_config (mode, spread_percent, sync_interval_minutes)
        VALUES ('MANUAL', -1.00, 60)
      `),
		).rejects.toThrow();

		// Invalid spread: 10.01 (must fail)
		await expect(
			pool.query(`
        INSERT INTO exchange_rate_config (mode, spread_percent, sync_interval_minutes)
        VALUES ('MANUAL', 10.01, 60)
      `),
		).rejects.toThrow();
	});

	it("creates the otc_purchase_status enum with all required values", async () => {
		const res = await pool.query(`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = 'otc_purchase_status'
      ORDER BY e.enumsortorder
    `);
		const enumLabels = res.rows.map((row) => row.enumlabel);

		expect(enumLabels).toEqual(["PENDING", "COMPLETED", "FAILED"]);
	});

	it("creates the wallex_otc_purchases table with required columns, types, and foreign key", async () => {
		const res = await pool.query(`
      SELECT column_name, data_type, udt_name, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'wallex_otc_purchases'
    `);
		const cols = Object.fromEntries(
			res.rows.map((r) => [r.column_name, { type: r.data_type, udt: r.udt_name, nullable: r.is_nullable }]),
		);

		expect(cols["id"]).toEqual({ type: "uuid", udt: "uuid", nullable: "NO" });
		expect(cols["top_up_request_id"]).toEqual({
			type: "uuid",
			udt: "uuid",
			nullable: "NO",
		});
		expect(cols["usdt_quantity"]).toEqual({
			type: "numeric",
			udt: "numeric",
			nullable: "NO",
		});
		expect(cols["status"]).toEqual({
			type: "USER-DEFINED",
			udt: "otc_purchase_status",
			nullable: "NO",
		});
		expect(cols["wallex_client_order_id"]).toEqual({
			type: "character varying",
			udt: "varchar",
			nullable: "YES",
		});
		expect(cols["wallex_executed_price"]).toEqual({
			type: "bigint",
			udt: "int8",
			nullable: "YES",
		});
		expect(cols["wallex_executed_qty"]).toEqual({
			type: "numeric",
			udt: "numeric",
			nullable: "YES",
		});
		expect(cols["wallex_executed_sum"]).toEqual({
			type: "bigint",
			udt: "int8",
			nullable: "YES",
		});
		expect(cols["wallex_fee"]).toEqual({
			type: "bigint",
			udt: "int8",
			nullable: "YES",
		});
		expect(cols["error_message"]).toEqual({
			type: "text",
			udt: "text",
			nullable: "YES",
		});
		expect(cols["created_at"]).toEqual({
			type: "timestamp with time zone",
			udt: "timestamptz",
			nullable: "NO",
		});
		expect(cols["updated_at"]).toEqual({
			type: "timestamp with time zone",
			udt: "timestamptz",
			nullable: "NO",
		});

		const fks = await pool.query(`
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
        AND tc.table_name = 'wallex_otc_purchases'
    `);
		const fkMap = Object.fromEntries(
			fks.rows.map((r) => [r.column_name, { table: r.foreign_table_name, col: r.foreign_column_name }]),
		);
		expect(fkMap["top_up_request_id"]).toEqual({
			table: "top_up_requests",
			col: "id",
		});
	});

	it("enforces partial uniqueness on wallex_otc_purchases: disallows multiple active (PENDING/COMPLETED) purchases per top_up_request but allows multiple FAILED purchases", async () => {
		const userRes = await pool.query(`
      INSERT INTO users (telegram_chat_id, telegram_username)
      VALUES (888777666, 'otc_user')
      RETURNING id
    `);
		const userId = userRes.rows[0].id;

		const rateRes = await pool.query(`
      INSERT INTO exchange_rates (irr_per_usd, created_by_admin_telegram_id)
      VALUES (600000, 987)
      RETURNING id
    `);
		const rateId = rateRes.rows[0].id;

		const topUpRes = await pool.query(`
      INSERT INTO top_up_requests (user_id, usd_amount, irr_amount, exchange_rate_id, locked_irr_per_usd, rate_source, status, expires_at)
      VALUES ('${userId}', 100.00, 60000000, '${rateId}', 600000, 'MANUAL', 'APPROVED', NOW() + INTERVAL '30 minutes')
      RETURNING id
    `);
		const topUpId = topUpRes.rows[0].id;

		// 1. First PENDING purchase succeeds
		const firstPending = await pool.query(`
      INSERT INTO wallex_otc_purchases (top_up_request_id, usdt_quantity, status)
      VALUES ('${topUpId}', 100.00, 'PENDING')
      RETURNING id
    `);
		expect(firstPending.rows[0]?.id).toBeDefined();

		// 2. Second PENDING purchase for same top_up_request must fail (partial unique index)
		await expect(
			pool.query(`
        INSERT INTO wallex_otc_purchases (top_up_request_id, usdt_quantity, status)
        VALUES ('${topUpId}', 100.00, 'PENDING')
      `),
		).rejects.toThrow();

		// 3. Fail the first purchase
		await pool.query(`
      UPDATE wallex_otc_purchases
      SET status = 'FAILED', error_message = 'Network timeout'
      WHERE id = '${firstPending.rows[0].id}'
    `);

		// 4. Now a new PENDING purchase can be inserted (for retry)
		const secondPending = await pool.query(`
      INSERT INTO wallex_otc_purchases (top_up_request_id, usdt_quantity, status)
      VALUES ('${topUpId}', 100.00, 'PENDING')
      RETURNING id
    `);
		expect(secondPending.rows[0]?.id).toBeDefined();

		// 5. Fail the second purchase as well (multiple FAILED allowed)
		await pool.query(`
      UPDATE wallex_otc_purchases
      SET status = 'FAILED', error_message = 'Insufficient TMN balance'
      WHERE id = '${secondPending.rows[0].id}'
    `);

		// 6. Third purchase succeeds and moves to COMPLETED
		const thirdPurchase = await pool.query(`
      INSERT INTO wallex_otc_purchases (top_up_request_id, usdt_quantity, status)
      VALUES ('${topUpId}', 100.00, 'PENDING')
      RETURNING id
    `);
		await pool.query(`
      UPDATE wallex_otc_purchases
      SET status = 'COMPLETED', wallex_client_order_id = 'order-999', wallex_executed_price = 600000, wallex_executed_qty = 100.00, wallex_executed_sum = 60000000, wallex_fee = 60000
      WHERE id = '${thirdPurchase.rows[0].id}'
    `);

		// 7. Cannot insert another PENDING or COMPLETED purchase after one is COMPLETED
		await expect(
			pool.query(`
        INSERT INTO wallex_otc_purchases (top_up_request_id, usdt_quantity, status)
        VALUES ('${topUpId}', 100.00, 'PENDING')
      `),
		).rejects.toThrow();

		await expect(
			pool.query(`
        INSERT INTO wallex_otc_purchases (top_up_request_id, usdt_quantity, status)
        VALUES ('${topUpId}', 100.00, 'COMPLETED')
      `),
		).rejects.toThrow();

		// 8. Total count for this top-up: 2 FAILED and 1 COMPLETED
		const countRes = await pool.query(`
      SELECT count(*)::int AS count FROM wallex_otc_purchases WHERE top_up_request_id = '${topUpId}'
    `);
		expect(countRes.rows[0].count).toBe(3);
	});

	it("correctly backfills locked_irr_per_usd and rate_source on top_up_requests", async () => {
		// 1. Setup user and exchange rate
		const userRes = await pool.query(`
      INSERT INTO users (telegram_chat_id, telegram_username)
      VALUES (555444333, 'backfill_user')
      RETURNING id
    `);
		const userId = userRes.rows[0].id;

		const rateRes = await pool.query(`
      INSERT INTO exchange_rates (irr_per_usd, created_by_admin_telegram_id)
      VALUES (585000, 111)
      RETURNING id
    `);
		const rateId = rateRes.rows[0].id;

		// 2. Temporarily drop NOT NULL to simulate pre-migration row state
		await pool.query(`ALTER TABLE top_up_requests ALTER COLUMN locked_irr_per_usd DROP NOT NULL`);
		await pool.query(`ALTER TABLE top_up_requests ALTER COLUMN rate_source DROP NOT NULL`);

		try {
			// 3. Insert row with NULL locked_irr_per_usd and NULL rate_source
			const topUpRes = await pool.query(`
        INSERT INTO top_up_requests (user_id, usd_amount, irr_amount, exchange_rate_id, locked_irr_per_usd, rate_source, status, expires_at)
        VALUES ('${userId}', 20.00, 11700000, '${rateId}', NULL, NULL, 'APPROVED', NOW() + INTERVAL '30 minutes')
        RETURNING id
      `);
			const topUpId = topUpRes.rows[0].id;

			// 4. Run the exact backfill SQL statement from the migration
			await pool.query(`
        UPDATE "top_up_requests"
        SET "locked_irr_per_usd" = "exchange_rates"."irr_per_usd",
            "rate_source" = 'MANUAL'
        FROM "exchange_rates"
        WHERE "top_up_requests"."exchange_rate_id" = "exchange_rates"."id"
          AND "top_up_requests"."id" = '${topUpId}'
      `);

			// 5. Verify row has been backfilled with correct joined rate and MANUAL source
			const verifyRes = await pool.query(`
        SELECT locked_irr_per_usd, rate_source
        FROM top_up_requests
        WHERE id = '${topUpId}'
      `);
			expect(verifyRes.rows[0].locked_irr_per_usd).toBe("585000");
			expect(verifyRes.rows[0].rate_source).toBe("MANUAL");
		} finally {
			// 6. Restore NOT NULL constraints
			await pool.query(`ALTER TABLE top_up_requests ALTER COLUMN locked_irr_per_usd SET NOT NULL`);
			await pool.query(`ALTER TABLE top_up_requests ALTER COLUMN rate_source SET NOT NULL`);
		}
	});
});
