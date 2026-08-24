import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function applyMigrations(
  db: NodePgDatabase<Record<string, unknown>>,
  migrationsFolder?: string
): Promise<void> {
  const targetFolder = migrationsFolder ?? path.resolve(__dirname, '../../drizzle');
  await migrate(db, { migrationsFolder: targetFolder });
}
