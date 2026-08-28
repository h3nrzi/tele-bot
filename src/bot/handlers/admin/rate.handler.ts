import type { Context } from 'grammy';
import { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import type { DbClient } from '@/core/database/client';
import { createAppContainer } from '@/core/di/container';
import {
  getRateCurrentMessage,
  getRateNotSetMessage,
} from '@/bot/handlers/admin/exchange-rate.messages';

/**
 * Handles the /rate command for Admins.
 */
export async function handleRate(
  ctx: Context,
  serviceOrDb?: ExchangeRateService | DbClient
): Promise<void> {
  if (!ctx.from) {
    return;
  }

  const service =
    serviceOrDb instanceof ExchangeRateService
      ? serviceOrDb
      : createAppContainer({ dbClient: serviceOrDb, child: true }).resolve(ExchangeRateService);

  const currentRate = await service.getCurrentRate();

  if (!currentRate) {
    await ctx.reply(getRateNotSetMessage());
    return;
  }

  await ctx.reply(
    getRateCurrentMessage({
      irrPerUsd: currentRate.irrPerUsd,
      createdAt: currentRate.createdAt,
    })
  );
}
