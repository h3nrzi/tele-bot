import type { Context } from 'grammy';
import type { DbClient } from '@/core/database/client';
import { createAppContainer } from '@/core/di/container';
import { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import { handleSetRate as handleSetRateNew } from '@/modules/exchange-rate/presentation/set-rate.handler';

export async function handleSetRate(
  ctx: Context,
  dbClient?: DbClient
): Promise<void> {
  const container = createAppContainer({ dbClient, child: true });
  return await handleSetRateNew(ctx, container.resolve(ExchangeRateService));
}
