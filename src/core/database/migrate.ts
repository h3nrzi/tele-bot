import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DbClient } from '@/core/database/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function applyMigrations(
  db: DbClient,
  migrationsFolder?: string
): Promise<void> {
  const targetFolder = migrationsFolder ?? path.resolve(__dirname, '../../../drizzle');
  await migrate(db, { migrationsFolder: targetFolder });
}
