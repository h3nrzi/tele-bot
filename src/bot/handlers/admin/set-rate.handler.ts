import type { Context } from 'grammy';
import type { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import {
  getSetRateSuccessMessage,
  getSetRateUsageErrorMessage,
} from '@/bot/handlers/admin/exchange-rate.messages';

/**
 * Handles the /setrate command for Admins.
 */
export async function handleSetRate(
  ctx: Context,
  service: ExchangeRateService
): Promise<void> {
  const sender = ctx.from;
  if (!sender) {
    return;
  }

  let rawRateInput: string | undefined;
  if (typeof ctx.match === 'string' && ctx.match.trim() !== '') {
    rawRateInput = ctx.match.trim();
  } else {
    const messageText = ctx.message?.text ?? '';
    const match = messageText.match(/^\/setrate(?:\s+(.*))?$/);
    rawRateInput = match?.[1]?.trim();
  }

  if (!rawRateInput || !/^\d+$/.test(rawRateInput)) {
    await ctx.reply(getSetRateUsageErrorMessage());
    return;
  }

  const irrPerUsd = BigInt(rawRateInput);

  if (irrPerUsd <= 0n) {
    await ctx.reply(getSetRateUsageErrorMessage());
    return;
  }

  const updatedRate = await service.setRate(
    sender.id,
    irrPerUsd
  );

  await ctx.reply(getSetRateSuccessMessage(updatedRate.irrPerUsd));
}
