import 'reflect-metadata';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import dotenv from 'dotenv';
import { beforeEach, afterAll } from 'vitest';
import type { DependencyContainer } from 'tsyringe';
import * as schema from '@/core/database/schema';
import { createAppContainer } from '@/core/di/container';

dotenv.config();

const { Pool } = pg;

export type TestDbClient = NodePgDatabase<typeof schema>;

export interface TestDatabaseContext {
  db: TestDbClient;
  pool: pg.Pool;
  container: DependencyContainer;
}

export function getTestDatabaseUrl(): string {
  return (
    process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/tele_bot_test'
  );
}

export function createTestDbClient(): TestDatabaseContext {
  const connectionString = getTestDatabaseUrl();
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });
  const container = createAppContainer({ dbClient: db, child: true });
  return { db, pool, container };
}

export async function truncateAllTables(poolOrDb: pg.Pool | TestDbClient): Promise<void> {
  const pool = 'pool' in poolOrDb ? (poolOrDb as unknown as { pool: pg.Pool }).pool : (poolOrDb as pg.Pool);

  // Fetch all base tables in public schema except drizzle migration metadata tables
  const queryResult = await pool.query<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name NOT LIKE '__drizzle%'
      AND table_name NOT LIKE 'drizzle%'
  `);

  if (queryResult.rows.length === 0) {
    return;
  }

  const tableNames = queryResult.rows.map((row) => `"${row.table_name}"`).join(', ');
  await pool.query(`TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE;`);
}

/**
 * Setup lifecycle hooks for test suites interacting with the real test database.
 * - Truncates all tables in beforeEach to guarantee test isolation.
 * - Closes database connections in afterAll.
 */
export function setupTestDatabase(): TestDatabaseContext {
  const context = createTestDbClient();

  beforeEach(async () => {
    await truncateAllTables(context.pool);
  });

  afterAll(async () => {
    await context.pool.end();
  });

  return context;
}
