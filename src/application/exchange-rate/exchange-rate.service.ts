import { createAppContainer } from '@/core/di/container';
import { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import type { ExchangeRate } from '@/modules/exchange-rate/exchange-rate.entity';
import type { DbClient } from '@/core/database/client';

export async function setRate(
  adminTelegramId: bigint | number,
  irrPerUsd: bigint | number,
  dbClient?: DbClient
): Promise<ExchangeRate> {
  const container = createAppContainer({ dbClient, child: true });
  const service = container.resolve(ExchangeRateService);
  return await service.setRate(adminTelegramId, irrPerUsd, dbClient);
}

export async function getCurrentRate(
  dbClient?: DbClient
): Promise<ExchangeRate | null> {
  const container = createAppContainer({ dbClient, child: true });
  const service = container.resolve(ExchangeRateService);
  return await service.getCurrentRate(dbClient);
}
