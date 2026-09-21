import { describe, it, expect, beforeEach, afterAll } from "vitest";
import pg from "pg";
import dotenv from "dotenv";
import { cleanDatabase } from "@/core/database/clean";
import { seedDatabase } from "@/core/database/seed";
import { createDatabaseConnection } from "@/core/database/client";
import { truncateAllTables } from "@tests/helpers/test-db";

dotenv.config();

const { Pool } = pg;

describe("Database Seed and Clean Scripts", () => {
	const connectionString =
		process.env.TEST_DATABASE_URL ||
		process.env.DATABASE_URL ||
		"postgres://postgres:postgres@localhost:5432/tele_bot_test";

	const pool = new Pool({ connectionString });
	const { db } = createDatabaseConnection(connectionString);

	beforeEach(async () => {
		await truncateAllTables(pool);
	});

	afterAll(async () => {
		await pool.end();
	});

	it("cleanDatabase() truncates all application tables while preserving drizzle migration tables", async () => {
		// Populate some initial test data first
		await seedDatabase({ pool, db });

		// Verify tables are non-empty
		const beforeUsers = await pool.query("SELECT COUNT(*) FROM users;");
		expect(Number(beforeUsers.rows[0].count)).toBeGreaterThan(0);

		// Execute cleanDatabase
		const cleanResult = await cleanDatabase({ pool });

		expect(cleanResult.dropped).toBe(false);
		expect(cleanResult.cleanedTables.length).toBeGreaterThan(0);
		expect(cleanResult.cleanedTables).toContain("users");
		expect(cleanResult.cleanedTables).toContain("wallets");
		expect(cleanResult.cleanedTables).toContain("catalog_items");
		expect(cleanResult.cleanedTables).toContain("orders");
		expect(cleanResult.cleanedTables).toContain("ledger_entries");

		// Verify tables are now empty
		const afterUsers = await pool.query("SELECT COUNT(*) FROM users;");
		expect(Number(afterUsers.rows[0].count)).toBe(0);

		const afterCatalog = await pool.query("SELECT COUNT(*) FROM catalog_items;");
		expect(Number(afterCatalog.rows[0].count)).toBe(0);

		const afterLedger = await pool.query("SELECT COUNT(*) FROM ledger_entries;");
		expect(Number(afterLedger.rows[0].count)).toBe(0);

		// Verify drizzle migrations table is still intact
		const drizzleTableRes = await pool.query(`
			SELECT COUNT(*) FROM information_schema.tables
			WHERE table_name = '__drizzle_migrations';
		`);
		expect(Number(drizzleTableRes.rows[0].count)).toBeGreaterThan(0);
	});

	it("seedDatabase() seeds bank accounts, exchange rates, catalog items, buyers, ledger entries, and orders", async () => {
		const seedResult = await seedDatabase({ pool, db });

		expect(seedResult.bankAccountsCount).toBe(2);
		expect(seedResult.exchangeRatesCount).toBe(1);
		expect(seedResult.catalogItemsCount).toBe(6);
		expect(seedResult.buyersCount).toBe(2);
		expect(seedResult.topUpRequestsCount).toBe(2);
		expect(seedResult.ordersCount).toBe(2);
		expect(seedResult.ledgerTransactionsCount).toBe(3);

		// Verify bank accounts: 1 active, 1 inactive
		const activeBank = await pool.query("SELECT * FROM bank_accounts WHERE is_active = true;");
		expect(activeBank.rows.length).toBe(1);
		expect(activeBank.rows[0].card_number).toBe("6037997123456789");

		const inactiveBank = await pool.query("SELECT * FROM bank_accounts WHERE is_active = false;");
		expect(inactiveBank.rows.length).toBe(1);

		// Verify exchange rate and config
		const rates = await pool.query("SELECT * FROM exchange_rates;");
		expect(rates.rows.length).toBe(1);
		expect(BigInt(rates.rows[0].irr_per_usd)).toBe(950000n);

		const rateConfig = await pool.query("SELECT * FROM exchange_rate_config;");
		expect(rateConfig.rows.length).toBe(1);
		expect(rateConfig.rows[0].mode).toBe("MANUAL");

		// Verify catalog items cover all 4 types and fulfillment strategies
		const catalogItems = await pool.query("SELECT * FROM catalog_items;");
		const types = catalogItems.rows.map((r) => r.catalog_type);
		expect(types).toContain("STATIC_DELIVERY");
		expect(types).toContain("DIRECT_ACCOUNT");
		expect(types).toContain("IDENTITY_HANDLE");
		expect(types).toContain("CONFIG_VPN");

		const vpnItem = catalogItems.rows.find((r) => r.catalog_type === "CONFIG_VPN");
		expect(vpnItem.requirement_config?.allowedRegions).toBeDefined();
		expect(Array.isArray(vpnItem.requirement_config.allowedRegions)).toBe(true);

		// Verify buyers
		const users = await pool.query("SELECT * FROM users ORDER BY telegram_username;");
		expect(users.rows.length).toBe(2);
		expect(users.rows.map((u) => u.telegram_username)).toEqual(["demo_buyer", "fresh_buyer"]);

		// Verify double-entry ledger balance: SUM(credits) - SUM(debits) = 0
		const ledgerBalanceRes = await pool.query(`
			SELECT
				SUM(CASE WHEN direction = 'CREDIT' THEN usd_amount ELSE 0 END) AS total_credits,
				SUM(CASE WHEN direction = 'DEBIT' THEN usd_amount ELSE 0 END) AS total_debits
			FROM ledger_entries;
		`);
		const totalCredits = parseFloat(ledgerBalanceRes.rows[0].total_credits);
		const totalDebits = parseFloat(ledgerBalanceRes.rows[0].total_debits);
		expect(totalCredits).toEqual(totalDebits);

		// Verify materialized wallet balance equals net buyer wallet ledger credits - debits
		const demoBuyerWallet = await pool.query(`
			SELECT w.available_balance,
				SUM(CASE WHEN le.direction = 'CREDIT' THEN le.usd_amount ELSE -le.usd_amount END) AS ledger_net
			FROM wallets w
			JOIN users u ON w.user_id = u.id
			JOIN ledger_entries le ON le.wallet_id = w.id
			WHERE u.telegram_username = 'demo_buyer'
			GROUP BY w.id, w.available_balance;
		`);
		expect(demoBuyerWallet.rows.length).toBe(1);
		const materialized = parseFloat(demoBuyerWallet.rows[0].available_balance);
		const ledgerNet = parseFloat(demoBuyerWallet.rows[0].ledger_net);
		expect(materialized).toBe(25.5);
		expect(ledgerNet).toBe(25.5);

		// Verify orders
		const orders = await pool.query("SELECT * FROM orders;");
		expect(orders.rows.length).toBe(2);
		const statuses = orders.rows.map((o) => o.status);
		expect(statuses).toContain("FULFILLED");
		expect(statuses).toContain("PLACED");
	});

	it("seedDatabase({ cleanFirst: true }) idempotently cleans and re-seeds without unique constraint conflicts", async () => {
		// First seed
		await seedDatabase({ pool, db });

		// Second seed with cleanFirst: true
		const result = await seedDatabase({ pool, db, cleanFirst: true });

		expect(result.buyersCount).toBe(2);
		expect(result.catalogItemsCount).toBe(6);

		const countRes = await pool.query("SELECT COUNT(*) FROM users;");
		expect(Number(countRes.rows[0].count)).toBe(2);
	});

	it("cleanDatabase() succeeds cleanly after full seed with complex foreign key hierarchies", async () => {
		await seedDatabase({ pool, db });

		const cleanResult = await cleanDatabase({ pool });
		expect(cleanResult.cleanedTables.length).toBeGreaterThan(0);

		// Verify all application tables are 0 rows
		const tablesRes = await pool.query(`
			SELECT table_name
			FROM information_schema.tables
			WHERE table_schema = 'public'
			  AND table_type = 'BASE TABLE'
			  AND table_name NOT LIKE '__drizzle%'
			  AND table_name NOT LIKE 'drizzle%';
		`);

		for (const row of tablesRes.rows) {
			const countRes = await pool.query(`SELECT COUNT(*) FROM "${row.table_name}";`);
			expect(Number(countRes.rows[0].count)).toBe(0);
		}
	});
});
