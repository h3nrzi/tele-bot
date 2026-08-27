import type { Context } from 'grammy';
import type { DbClient } from '../../../../db/client';
import { setRate } from '../../../../application/exchange-rate/exchange-rate.service';
import {
  extractSetRateArgument,
  parseSetRateArg,
  getSetRateUsageErrorMessage,
  getSetRateSuccessMessage,
} from './exchange-rate.messages';

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
  dbClient?: DbClient
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

  const newRate = await setRate(ctx.from.id, parsedRate, dbClient);
  await ctx.reply(getSetRateSuccessMessage(newRate.irrPerUsd));
}
