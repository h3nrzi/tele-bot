#!/usr/bin/env node
import dotenv from "dotenv";
import { cleanDatabase } from "@/core/database/clean";
import { seedDatabase } from "@/core/database/seed";

dotenv.config();

async function main(): Promise<void> {
	console.log("🔄 Resetting database (clean + migrate + seed)...");

	try {
		console.log("🧹 1/2 Cleaning existing data...");
		const cleanResult = await cleanDatabase({ drop: false });
		console.log(`   Cleaned ${cleanResult.cleanedTables.length} tables in ${cleanResult.durationMs}ms.`);

		console.log("🌱 2/2 Applying migrations and seeding fresh data...");
		const seedResult = await seedDatabase({ cleanFirst: false });

		console.log(`✅ Database reset completed in ${cleanResult.durationMs + seedResult.durationMs}ms:`);
		console.log(`   🏦 Bank accounts:       ${seedResult.bankAccountsCount}`);
		console.log(`   💱 Exchange rates:      ${seedResult.exchangeRatesCount}`);
		console.log(`   📦 Catalog items:       ${seedResult.catalogItemsCount}`);
		console.log(`   👤 Buyers & Wallets:    ${seedResult.buyersCount}`);
		console.log(`   💳 Top-Up requests:     ${seedResult.topUpRequestsCount}`);
		console.log(`   🛍️ Orders:              ${seedResult.ordersCount}`);
		console.log(`   📑 Ledger transactions: ${seedResult.ledgerTransactionsCount}`);
		process.exit(0);
	} catch (error) {
		console.error("❌ Failed to reset database:", error);
		process.exit(1);
	}
}

main();
