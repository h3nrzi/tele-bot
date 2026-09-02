import type { Context } from 'grammy';
import type { BotContext } from '@/bot/context';
import type { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import { formatIrr } from '@/core/shared/currency.utils';
import { SETRATE_CONVERSATION_ID, cleanRateInput, isValidRateInput } from '@/bot/handlers/admin/set-rate.conversation';

/**
 * Handles the /setrate command for Admins.
 * If an argument is provided, updates the rate immediately.
 * Otherwise enters the interactive setrate conversation.
 */
export async function handleSetRate(
  ctx: Context | BotContext,
  service: ExchangeRateService
): Promise<void> {
  const sender = ctx.from;
  if (!sender) {
    return;
  }

  let rawRateInput: string | undefined;
  const messageText = ctx.message?.text ?? '';
  if (messageText.startsWith('/setrate')) {
    const match = messageText.match(/^\/setrate(?:\s+(.*))?$/);
    rawRateInput = match?.[1]?.trim();
  } else if (typeof ctx.match === 'string' && ctx.match.trim() !== '' && !ctx.match.includes('تنظیم نرخ ارز')) {
    rawRateInput = ctx.match.trim();
  }

  // If no argument is provided, enter the conversation if available
  if (!rawRateInput) {
    if ('conversation' in ctx && typeof (ctx as BotContext).conversation?.enter === 'function') {
      await (ctx as BotContext).conversation.enter(SETRATE_CONVERSATION_ID);
      return;
    }

    const usageErrorMsg =
      `❌ فرمت نرخ وارد شده نامعتبر است.\n` +
      `لطفاً یک عدد صحیح مثبت به ریال وارد کنید.\n` +
      `مثال: /setrate 620000`;
    await ctx.reply(usageErrorMsg);
    return;
  }

  const usageErrorMsg =
    `❌ فرمت نرخ وارد شده نامعتبر است.\n` +
    `لطفاً یک عدد صحیح مثبت به ریال وارد کنید.\n` +
    `مثال: /setrate 620000`;

  if (!isValidRateInput(rawRateInput)) {
    await ctx.reply(usageErrorMsg);
    return;
  }

  const cleaned = cleanRateInput(rawRateInput);
  const irrPerUsd = BigInt(cleaned);

  const updatedRate = await service.setRate(
    sender.id,
    irrPerUsd
  );

  await ctx.reply(
    `✅ نرخ جدید با موفقیت تنظیم شد:\nهر ۱ دلار آمریکا = ${formatIrr(updatedRate.irrPerUsd)} ریال`
  );
}
