import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import dotenv from 'dotenv';
import * as schema from './schema/index';

dotenv.config();

const { Pool } = pg;

export type DbClient = NodePgDatabase<typeof schema>;

export interface DatabaseConnection {
  db: DbClient;
  pool: pg.Pool;
}

export function createDatabaseConnection(connectionString?: string): DatabaseConnection {
  const connStr =
    connectionString ||
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/tele_bot_dev';

  const pool = new Pool({ connectionString: connStr });
  const db = drizzle(pool, { schema });

  return { db, pool };
}

let defaultConnection: DatabaseConnection | null = null;

/**
 * Returns a shared default database client singleton for the application.
 */
export function getDefaultDb(): DbClient {
  if (!defaultConnection) {
    defaultConnection = createDatabaseConnection();
  }
  return defaultConnection.db;
}
