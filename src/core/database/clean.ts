import pg from "pg";
import { createDatabaseConnection, type DbClient } from "@/core/database/client";

export interface CleanDatabaseOptions {
	pool?: pg.Pool | undefined;
	db?: DbClient | undefined;
	connectionString?: string | undefined;
	drop?: boolean | undefined;
}

export interface CleanResult {
	cleanedTables: string[];
	dropped: boolean;
	durationMs: number;
}

/**
 * Discovers all application base tables in the public schema (excluding Drizzle metadata tables)
 * and truncates or drops them.
 */
export async function cleanDatabase(options?: CleanDatabaseOptions): Promise<CleanResult> {
	const startTime = Date.now();
	let pool: pg.Pool;
	let shouldClosePool = false;

	if (options?.pool) {
		pool = options.pool;
	} else if (
		options?.db &&
		"session" in options.db &&
		(options.db as unknown as { session: { client: pg.Pool } }).session?.client
	) {
		pool = (options.db as unknown as { session: { client: pg.Pool } }).session.client;
	} else {
		const conn = createDatabaseConnection(options?.connectionString);
		pool = conn.pool;
		shouldClosePool = true;
	}

	try {
		if (options?.drop) {
			// Complete drop of public schema (all tables, views, enums)
			await pool.query(`
				DROP SCHEMA public CASCADE;
				CREATE SCHEMA public;
				GRANT ALL ON SCHEMA public TO postgres;
				GRANT ALL ON SCHEMA public TO public;
			`);

			return {
				cleanedTables: ["* (all tables and enums dropped)"],
				dropped: true,
				durationMs: Date.now() - startTime,
			};
		}

		// Fetch all application tables in public schema
		const queryResult = await pool.query<{ table_name: string }>(`
			SELECT table_name
			FROM information_schema.tables
			WHERE table_schema = 'public'
			  AND table_type = 'BASE TABLE'
			  AND table_name NOT LIKE '__drizzle%'
			  AND table_name NOT LIKE 'drizzle%'
			ORDER BY table_name;
		`);

		const tableNames = queryResult.rows.map((row) => row.table_name);

		if (tableNames.length > 0) {
			const quotedTables = tableNames.map((name) => `"${name}"`).join(", ");
			await pool.query(`TRUNCATE TABLE ${quotedTables} RESTART IDENTITY CASCADE;`);
		}

		return {
			cleanedTables: tableNames,
			dropped: false,
			durationMs: Date.now() - startTime,
		};
	} finally {
		if (shouldClosePool) {
			await pool.end();
		}
	}
}
