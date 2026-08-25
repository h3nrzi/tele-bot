import type { Context } from 'grammy';
import type { DbClient } from '../../db/client';
import { getCurrentRate } from '../../services/exchange-rate.service';

/**
 * Returns the message showing the current Exchange Rate and when it was set.
 */
export function getCurrentRateMessage(
  rate: { irrPerUsd: bigint | number; createdAt: Date }
): string {
  const formatted = rate.irrPerUsd.toLocaleString('en-US');
  return `Current exchange rate: 1 USD = ${formatted} IRR.\nSet at: ${rate.createdAt.toISOString()}`;
}

/**
 * Returns the message sent when no Exchange Rate has been configured yet.
 */
export function getNoRateConfiguredMessage(): string {
  return 'No exchange rate is currently configured. Use /setrate <irr_amount> to set one.';
}

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
