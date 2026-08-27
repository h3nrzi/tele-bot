import type { Context } from 'grammy';
import type { DbClient } from '@/db/client';
import { getCurrentRate } from '@/application/exchange-rate/exchange-rate.service';
import {
  getCurrentRateMessage,
  getNoRateConfiguredMessage,
} from '@/bot/modules/admin/exchange-rate/exchange-rate.messages';

/**
 * Handles the /rate Admin command.
 * - If a rate exists: shows the current `irr_per_usd` value and when it was set.
 * - If no rate exists: tells the Admin that no rate is configured.
 * - If ctx.from is undefined: silently ignores.
 */
export async function handleRate(
  ctx: Context,
  dbClient?: DbClient
): Promise<void> {
  if (!ctx.from) {
    return;
  }

  const rate = await getCurrentRate(dbClient);

  if (!rate) {
    await ctx.reply(getNoRateConfiguredMessage());
    return;
  }

  await ctx.reply(getCurrentRateMessage(rate));
}
