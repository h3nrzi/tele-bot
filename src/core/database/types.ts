import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type * as schema from '@/core/database/schema';

/**
 * Universal Database Executor representing either a top-level NodePgDatabase or an active PgTransaction.
 */
export type DbExecutor =
  | NodePgDatabase<typeof schema>
  | PgTransaction<any, typeof schema, any>;
