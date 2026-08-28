import type { Context } from 'grammy';
import type { DbClient } from '@/core/database/client';
import { createAppContainer } from '@/core/di/container';
import { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import { handleRate as handleRateNew } from '@/modules/exchange-rate/presentation/rate.handler';

export async function handleRate(
  ctx: Context,
  dbClient?: DbClient
): Promise<void> {
  const container = createAppContainer({ dbClient, child: true });
  return await handleRateNew(ctx, container.resolve(ExchangeRateService));
}
