import type { Context } from 'grammy';
import type { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import {
  getRateCurrentMessage,
  getRateNotSetMessage,
} from '@/bot/handlers/admin/exchange-rate.messages';

/**
 * Handles the /rate command for Admins.
 */
export async function handleRate(
  ctx: Context,
  service: ExchangeRateService
): Promise<void> {
  if (!ctx.from) {
    return;
  }

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
