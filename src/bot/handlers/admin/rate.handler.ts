import type { Context } from 'grammy';
import type { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import type { ExchangeRateConfigService } from '@/modules/exchange-rate/exchange-rate-config.service';
import { formatIrr } from '@/core/shared/currency.utils';
import { formatPersianDateTime } from '@/core/shared/date.utils';

/**
 * Handles the /rate command for Admins.
 * Displays current rate enriched with Rate Mode (MANUAL | AUTO_SYNC), spread percentage, and timestamp.
 */
export async function handleRate(
  ctx: Context,
  service: ExchangeRateService,
  configService?: ExchangeRateConfigService
): Promise<void> {
  if (!ctx.from) {
    return;
  }

  const currentRate = await service.getCurrentRate();
  const config = configService ? await configService.getConfig() : null;

  if (!currentRate) {
    await ctx.reply(
      '⚠️ در حال حاضر هیچ نرخ ارزی در سیستم تنظیم نشده است. لطفاً با دستور /setrate نرخ ارز را تنظیم کنید.'
    );
    return;
  }

  const date = currentRate.createdAt ?? new Date();
  const isAutoSync = config ? config.isAutoSync() : false;

  let message: string;
  if (isAutoSync && config) {
    message =
      `💱 *نرخ فعلی تبدیل ارز:*\n\n` +
      `وضعیت: *خودکار (Auto-Sync)*\n` +
      `اسپرد: *${config.spreadPercent}%*\n` +
      `هر ۱ دلار آمریکا = ${formatIrr(currentRate.irrPerUsd)} ریال\n` +
      `آخرین به‌روزرسانی: ${formatPersianDateTime(date)}`;
  } else {
    message =
      `💱 *نرخ فعلی تبدیل ارز:*\n\n` +
      `وضعیت: *دستی (MANUAL)*\n` +
      `هر ۱ دلار آمریکا = ${formatIrr(currentRate.irrPerUsd)} ریال\n` +
      `آخرین به‌روزرسانی: ${formatPersianDateTime(date)}`;
  }

  await ctx.reply(message, { parse_mode: 'Markdown' });
}
