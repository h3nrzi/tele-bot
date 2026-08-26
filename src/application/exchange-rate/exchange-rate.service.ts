import type { DbClient } from '../../db/client';
import { getDefaultDb } from '../../db/client';
import { exchangeRateRepository } from '../../infrastructure/repositories/drizzle-exchange-rate.repository';
import { normalizeChatId } from '../../utils/telegram';
import { ExchangeRate } from '../../domain/exchange-rate/exchange-rate.entity';
import { InvalidExchangeRateError } from '../../domain/exchange-rate/exchange-rate.errors';

/**
 * Appends a new Exchange Rate row and returns the domain entity.
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
    throw new InvalidExchangeRateError(
      'Exchange rate (irrPerUsd) must be a positive integer'
    );
  }

  return await exchangeRateRepository.insert(
    {
      createdByAdminTelegramId: adminId,
      irrPerUsd: rate,
    },
    client
  );
}

/**
 * Returns the most recently created Exchange Rate entity, or null if no rate exists.
 */
export async function getCurrentRate(
  dbClient?: DbClient
): Promise<ExchangeRate | null> {
  const client = dbClient ?? getDefaultDb();
  return await exchangeRateRepository.findLatest(client);
}
