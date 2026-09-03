import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import type { BotConversation } from '@/bot/context';
import type { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import { formatIrr } from '@/core/shared/currency.utils';
import { isCancelCommand } from '@/core/shared/telegram.utils';

export type SetRateConversation = BotConversation;
export const SETRATE_CONVERSATION_ID = 'setrate';

/**
 * Cleans a rate input string by normalizing Persian/Arabic digits and removing commas and whitespace.
 */
export function cleanRateInput(text: string): string {
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

  let cleaned = text.trim();
  for (let i = 0; i < 10; i++) {
    const p = persianDigits[i];
    const a = arabicDigits[i];
    if (p) cleaned = cleaned.replaceAll(p, String(i));
    if (a) cleaned = cleaned.replaceAll(a, String(i));
  }

  return cleaned.replace(/[,\s_]/g, '');
}

/**
 * Validates that input is a positive integer.
 */
export function isValidRateInput(text: string): boolean {
  const cleaned = cleanRateInput(text);
  if (!/^\d+$/.test(cleaned)) {
    return false;
  }
  try {
    const val = BigInt(cleaned);
    return val > 0n;
  } catch {
    return false;
  }
}

/**
 * Creates the grammY conversation for Admin exchange rate setup flow.
 */
export function createSetRateConversation(exchangeRateService: ExchangeRateService) {
  return async function setRateConversation(
    conversation: SetRateConversation,
    ctx: Context
  ): Promise<void> {
    const sender = ctx.from;
    if (!sender) {
      return;
    }

    if (ctx.callbackQuery) {
      try {
        await ctx.answerCallbackQuery();
      } catch {}
    }

    await ctx.reply(
      '💱 *تنظیم نرخ ارز*\n\nلطفاً نرخ جدید هر ۱ دلار آمریکا را به ریال وارد کنید (مثال: 620000):',
      {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard().text('❌ انصراف', 'flow:cancel'),
      }
    );

    while (true) {
      const nextCtx = await conversation.wait();
      const text = nextCtx.message?.text ?? '';
      const cb = nextCtx.callbackQuery?.data;

      if (cb === 'flow:cancel' || isCancelCommand(text)) {
        if (nextCtx.callbackQuery) {
          try {
            await nextCtx.answerCallbackQuery();
          } catch {}
        }
        await nextCtx.reply('❌ عملیات تنظیم نرخ ارز لغو شد.');
        return;
      }

      if (isValidRateInput(text)) {
        const cleaned = cleanRateInput(text);
        const irrPerUsd = BigInt(cleaned);

        const updatedRate = await conversation.external(async () => {
          return await exchangeRateService.setRate(sender.id, irrPerUsd);
        });

        await nextCtx.reply(
          `✅ نرخ جدید با موفقیت تنظیم شد:\nهر ۱ دلار آمریکا = ${formatIrr(updatedRate.irrPerUsd)} ریال`
        );
        return;
      }

      await nextCtx.reply(
        '❌ فرمت نرخ وارد شده نامعتبر است. لطفاً یک عدد صحیح مثبت به ریال وارد کنید (مثال: 620000):',
        {
          reply_markup: new InlineKeyboard().text('❌ انصراف', 'flow:cancel'),
        }
      );
    }
  };
}
