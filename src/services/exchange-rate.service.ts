import { desc } from 'drizzle-orm';
import type { DbClient } from '../db/client';
import { getDefaultDb } from '../db/client';
import { exchangeRates, type ExchangeRate } from '../db/schema/exchange-rates';
import { normalizeChatId } from '../utils/telegram';

/**
 * Appends a new Exchange Rate row and returns it.
 * Never modifies or deletes existing rows.
 */
export async function setRate(
  adminTelegramId: bigint | number,
  irrPerUsd: bigint | number,
  dbClient?: DbClient
): Promise<ExchangeRate> {
  const client = dbClient ?? getDefaultDb();
  const adminId = normalizeChatId(adminTelegramId);
  const rate = typeof irrPerUsd === 'bigint' ? irrPerUsd : BigInt(irrPerUsd);

  if (rate <= 0n) {
    throw new Error('Exchange rate (irrPerUsd) must be a positive integer');
  }

  const [insertedRate] = await client
    .insert(exchangeRates)
    .values({
      createdByAdminTelegramId: adminId,
      irrPerUsd: rate,
    })
    .returning();

  if (!insertedRate) {
    throw new Error('Failed to insert exchange rate');
  }

  return insertedRate;
}

/**
 * Returns the most recently created exchange_rates row, or null if no row exists.
 */
export async function getCurrentRate(
  dbClient?: DbClient
): Promise<ExchangeRate | null> {
  const client = dbClient ?? getDefaultDb();

  const [latestRate] = await client
    .select()
    .from(exchangeRates)
    .orderBy(desc(exchangeRates.createdAt))
    .limit(1);

  return latestRate ?? null;
}

