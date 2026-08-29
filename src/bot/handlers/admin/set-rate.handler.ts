import type { Context } from 'grammy';
import type { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import { formatIrr } from '@/core/shared/currency.utils';

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

  const usageErrorMsg =
    `❌ فرمت نرخ وارد شده نامعتبر است.\n` +
    `لطفاً یک عدد صحیح مثبت به ریال وارد کنید.\n` +
    `مثال: /setrate 620000`;

  if (!rawRateInput || !/^\d+$/.test(rawRateInput)) {
    await ctx.reply(usageErrorMsg);
    return;
  }

  const irrPerUsd = BigInt(rawRateInput);

  if (irrPerUsd <= 0n) {
    await ctx.reply(usageErrorMsg);
    return;
  }

  const updatedRate = await service.setRate(
    sender.id,
    irrPerUsd
  );

  await ctx.reply(
    `✅ نرخ جدید با موفقیت تنظیم شد:\nهر ۱ دلار آمریکا = ${formatIrr(updatedRate.irrPerUsd)} ریال`
  );
}
