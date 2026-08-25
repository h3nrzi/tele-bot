import type { Context } from 'grammy';
import type { DbClient } from '../../db/client';
import { setRate } from '../../services/exchange-rate.service';

/**
 * Returns the confirmation message sent to the Admin after successfully updating the Exchange Rate.
 */
export function getSetRateSuccessMessage(irrPerUsd: bigint | number): string {
  const formatted = irrPerUsd.toLocaleString('en-US');
  return `Exchange rate updated: 1 USD = ${formatted} IRR.`;
}

/**
 * Returns the usage error message sent to the Admin when /setrate arguments are invalid or missing.
 */
export function getSetRateUsageErrorMessage(): string {
  return 'Invalid format. Usage: /setrate <irr_amount>\nExample: /setrate 620000 (must be a positive integer).';
}

/**
 * Parses and validates the raw exchange rate argument string as a positive bigint.
 * Returns null if the argument is missing, non-numeric, zero, or negative.
 */
export function parseSetRateArg(raw: string | undefined | null): bigint | null {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const value = BigInt(trimmed);
  if (value <= 0n) {
    return null;
  }

  return value;
}

/**
 * Extracts the argument string passed to /setrate from either ctx.match or ctx.message.text.
 */
export function extractSetRateArgument(ctx: Context): string | undefined {
  if (typeof ctx.match === 'string') {
    return ctx.match.trim();
  }

  if (ctx.message?.text) {
    const parts = ctx.message.text.trim().split(/\s+/);
    if (parts.length > 1) {
      return parts.slice(1).join(' ').trim();
    }
    return '';
  }

  return undefined;
}

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
