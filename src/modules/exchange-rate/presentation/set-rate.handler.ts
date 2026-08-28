import type { Context } from 'grammy';
import type { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import {
  extractSetRateArgument,
  parseSetRateArg,
  getSetRateUsageErrorMessage,
  getSetRateSuccessMessage,
} from '@/modules/exchange-rate/presentation/exchange-rate.messages';

/**
 * Handles the /setrate Admin command.
 * - Validates that <irr_amount> is a positive integer.
 * - Calls setRate service function to append the new rate.
 * - Confirms the new active rate to the Admin.
 * - If invalid, sends usage guidance.
 * - If ctx.from is undefined, silently ignores.
 */
export async function handleSetRate(
  ctx: Context,
  exchangeRateService: ExchangeRateService
): Promise<void> {
  if (!ctx.from) {
    return;
  }

  const rawArg = extractSetRateArgument(ctx);
  const parsedRate = parseSetRateArg(rawArg);

  if (parsedRate === null) {
    await ctx.reply(getSetRateUsageErrorMessage());
    return;
  }

  const newRate = await exchangeRateService.setRate(ctx.from.id, parsedRate);
  await ctx.reply(getSetRateSuccessMessage(newRate.irrPerUsd));
}
