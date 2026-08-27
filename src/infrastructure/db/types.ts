import type { NodePgDatabase, NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type * as schema from '@/db/schema/index';

export type DbClient = NodePgDatabase<typeof schema>;

export type DbTransaction = PgTransaction<
  NodePgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/**
 * An executor represents either a standalone Drizzle DB client or an in-progress Transaction.
 */
export type DbExecutor = DbClient | DbTransaction;
