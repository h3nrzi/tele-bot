import type { Context } from 'grammy';
import type { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import {
  getCurrentRateMessage,
  getNoRateConfiguredMessage,
} from '@/modules/exchange-rate/presentation/exchange-rate.messages';
import { getAdminMainMenuKeyboard } from '@/core/bot/keyboards/menu.keyboards';

/**
 * Handles the /rate Admin command.
 * - If a rate exists: shows the current `irr_per_usd` value and when it was set.
 * - If no rate exists: tells the Admin that no rate is configured.
 * - If ctx.from is undefined: silently ignores.
 */
export async function handleRate(
  ctx: Context,
  exchangeRateService: ExchangeRateService
): Promise<void> {
  if (!ctx.from) {
    return;
  }

  const rate = await exchangeRateService.getCurrentRate();

  if (!rate) {
    await ctx.reply(getNoRateConfiguredMessage(), {
      reply_markup: getAdminMainMenuKeyboard(),
    });
    return;
  }

  await ctx.reply(getCurrentRateMessage(rate), {
    reply_markup: getAdminMainMenuKeyboard(),
  });
}
