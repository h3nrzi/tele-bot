import type { Context } from 'grammy';
import type { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import { formatIrr } from '@/core/shared/currency.utils';
import { formatPersianDateTime } from '@/core/shared/date.utils';

/**
 * Handles the /rate command for Admins.
 */
export async function handleRate(
  ctx: Context,
  service: ExchangeRateService
): Promise<void> {
  if (!ctx.from) {
    return;
  }

  const currentRate = await service.getCurrentRate();

  if (!currentRate) {
    await ctx.reply(
      '⚠️ در حال حاضر هیچ نرخ ارزی در سیستم تنظیم نشده است. لطفاً با دستور /setrate نرخ ارز را تنظیم کنید.'
    );
    return;
  }

  const date = currentRate.createdAt ?? new Date();
  await ctx.reply(
    `💱 نرخ فعلی تبدیل ارز:\n\n` +
    `هر ۱ دلار آمریکا = ${formatIrr(currentRate.irrPerUsd)} ریال\n` +
    `آخرین به‌روزرسانی: ${formatPersianDateTime(date)}`
  );
}
