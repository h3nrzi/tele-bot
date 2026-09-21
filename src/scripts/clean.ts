#!/usr/bin/env node
import dotenv from "dotenv";
import { cleanDatabase } from "@/core/database/clean";

dotenv.config();

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const drop = args.includes("--drop");

	console.log(
		drop
			? "⚠️  Dropping all public tables and schema..."
			: "🧹 Cleaning database (truncating tables with RESTART IDENTITY CASCADE)...",
	);

	try {
		const result = await cleanDatabase({ drop });

		if (result.dropped) {
			console.log(`✅ Database schema dropped successfully in ${result.durationMs}ms.`);
		} else if (result.cleanedTables.length === 0) {
			console.log(`ℹ️  No application tables found to clean (${result.durationMs}ms).`);
		} else {
			console.log(`✅ Truncated ${result.cleanedTables.length} tables in ${result.durationMs}ms:`);
			for (const table of result.cleanedTables) {
				console.log(`   - ${table}`);
			}
		}
		process.exit(0);
	} catch (error) {
		console.error("❌ Failed to clean database:", error);
		process.exit(1);
	}
}

main();
