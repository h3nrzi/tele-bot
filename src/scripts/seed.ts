#!/usr/bin/env node
import dotenv from "dotenv";
import { seedDatabase } from "@/core/database/seed";

dotenv.config();

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const cleanFirst = args.includes("--clean") || args.includes("-c");

	console.log(cleanFirst ? "🌱 Cleaning and seeding database..." : "🌱 Seeding database...");

	try {
		const result = await seedDatabase({ cleanFirst });

		console.log(`✅ Database seeded successfully in ${result.durationMs}ms:`);
		console.log(`   🏦 Bank accounts:       ${result.bankAccountsCount}`);
		console.log(`   💱 Exchange rates:      ${result.exchangeRatesCount}`);
		console.log(`   📦 Catalog items:       ${result.catalogItemsCount}`);
		console.log(`   👤 Buyers & Wallets:    ${result.buyersCount}`);
		console.log(`   💳 Top-Up requests:     ${result.topUpRequestsCount}`);
		console.log(`   🛍️ Orders:              ${result.ordersCount}`);
		console.log(`   📑 Ledger transactions: ${result.ledgerTransactionsCount}`);
		process.exit(0);
	} catch (error) {
		console.error("❌ Failed to seed database:", error);
		process.exit(1);
	}
}

main();
