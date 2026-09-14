import { InlineKeyboard, type Context } from 'grammy';
import type { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import type { ExchangeRateConfigService } from '@/modules/exchange-rate/exchange-rate-config.service';
import type { WallexClient } from '@/modules/wallex/wallex.client.interface';
import { formatIrr } from '@/core/shared/currency.utils';

export interface RateModeHandlerDependencies {
  exchangeRateConfigService: ExchangeRateConfigService;
  exchangeRateService: ExchangeRateService;
  wallexClient?: WallexClient | undefined;
}

/**
 * Handles the /ratemode command and '🔄 حالت نرخ ارز' button.
 * Prompts the admin with the current Rate Mode and an inline confirmation button to switch modes.
 */
export async function handleRateModeCommand(
  ctx: Context,
  deps: RateModeHandlerDependencies
): Promise<void> {
  if (!ctx.from) {
    return;
  }

  const config = await deps.exchangeRateConfigService.getConfig();

  if (config.isManual()) {
    const keyboard = new InlineKeyboard()
      .text('🔄 تأیید تغییر به خودکار', 'ratemode:switch:AUTO_SYNC')
      .row()
      .text('❌ انصراف', 'ratemode:cancel');

    await ctx.reply(
      '🔄 *تنظیم حالت نرخ ارز*\n\n' +
      'حالت فعلی: *دستی (MANUAL)*\n' +
      'در حالت دستی، نرخ ارز فقط توسط مدیر تعیین می‌شود.\n\n' +
      'آیا مایل به فعال‌سازی حالت *خودکار (Auto-Sync)* هستید؟\n' +
      'در حالت خودکار، سیستم نرخ تتر را مستقیماً از صرافی والکس استعلام و با احتساب اسپرد تنظیم‌شده محاسبه می‌کند.\n' +
      '⚠️ در هنگام تغییر حالت، ارتباط با والکس فوراً آزمایش و اولین نرخ پایه دریافت خواهد شد.',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      }
    );
  } else {
    const keyboard = new InlineKeyboard()
      .text('✏️ تأیید تغییر به دستی', 'ratemode:switch:MANUAL')
      .row()
      .text('❌ انصراف', 'ratemode:cancel');

    await ctx.reply(
      '🔄 *تنظیم حالت نرخ ارز*\n\n' +
      'حالت فعلی: *خودکار (Auto-Sync)*\n' +
      'در حالت خودکار، نرخ‌ها از والکس دریافت و به‌روزرسانی می‌شوند.\n\n' +
      'آیا مایل به تغییر حالت به *دستی (MANUAL)* هستید؟\n' +
      'در حالت دستی، آخرین نرخ دریافت شده از والکس تا زمان تنظیم نرخ جدید توسط مدیر، فعال باقی خواهد ماند.',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      }
    );
  }
}

/**
 * Handles the inline callback queries for switching Rate Mode (ratemode:switch:AUTO_SYNC | ratemode:switch:MANUAL).
 */
export async function handleRateModeSwitchCallback(
  ctx: Context,
  deps: RateModeHandlerDependencies
): Promise<void> {
  const sender = ctx.from;
  if (!sender) {
    return;
  }

  let targetMode: string | undefined;
  if (typeof ctx.match === 'string') {
    targetMode = ctx.match;
  } else if (Array.isArray(ctx.match)) {
    targetMode = ctx.match[1];
  } else if (ctx.callbackQuery?.data) {
    const parts = ctx.callbackQuery.data.split(':');
    targetMode = parts[parts.length - 1];
  }

  if (targetMode === 'AUTO_SYNC') {
    if (!deps.wallexClient) {
      if (ctx.callbackQuery) {
        try {
          await ctx.answerCallbackQuery({
            text: 'صرافی والکس پیکربندی نشده است.',
            show_alert: true,
          });
        } catch {}
      }
      await editOrReply(
        ctx,
        '❌ *خطا در اتصال به صرافی والکس*\n\n' +
        'سرویس ارتباط با والکس (WallexClient) در دسترس نیست.\n' +
        'تغییر حالت لغو شد و سیستم در حالت دستی باقی ماند.'
      );
      return;
    }

    try {
      // Step 1: Immediately fetch a Wallex OTC quote to verify connectivity
      const quote = await deps.wallexClient.getOtcPrice('USDTTMN', 'BUY');

      // Step 2: Insert as first baseline rate in exchange_rates
      const creatorId = ctx.me?.id ? BigInt(ctx.me.id) : BigInt(sender.id);
      await deps.exchangeRateService.setRate(creatorId, quote.priceIrr);

      // Step 3: Update config mode to AUTO_SYNC
      await deps.exchangeRateConfigService.updateMode('AUTO_SYNC', sender.id);

      if (ctx.callbackQuery) {
        try {
          await ctx.answerCallbackQuery({ text: 'حالت نرخ ارز با موفقیت به خودکار تغییر یافت.' });
        } catch {}
      }

      await editOrReply(
        ctx,
        `✅ *حالت نرخ ارز با موفقیت به خودکار (Auto-Sync) تغییر یافت.*\n\n` +
        `نرخ پایه اولیه از والکس دریافت و در سیستم ثبت شد:\n` +
        `هر ۱ دلار آمریکا = ${formatIrr(quote.priceIrr)} ریال`
      );
    } catch (err: any) {
      if (ctx.callbackQuery) {
        try {
          await ctx.answerCallbackQuery({
            text: 'خطا در ارتباط با والکس. تغییر حالت لغو شد.',
            show_alert: true,
          });
        } catch {}
      }

      const errorMessage = err?.message || 'خطای نامشخص در ارتباط با والکس';
      await editOrReply(
        ctx,
        `❌ *خطا در اتصال به صرافی والکس*\n\n` +
        `سیستم نتوانست با والکس ارتباط برقرار کند و نرخ تتر را دریافت نماید.\n` +
        `تغییر حالت لغو شد و سیستم در حالت دستی باقی ماند.\n\n` +
        `علت: ${errorMessage}`
      );
    }
  } else if (targetMode === 'MANUAL') {
    // Switching to MANUAL: preserve last synced rate, just update mode
    await deps.exchangeRateConfigService.updateMode('MANUAL', sender.id);

    if (ctx.callbackQuery) {
      try {
        await ctx.answerCallbackQuery({ text: 'حالت نرخ ارز با موفقیت به دستی تغییر یافت.' });
      } catch {}
    }

    await editOrReply(
      ctx,
      '✅ *حالت نرخ ارز با موفقیت به دستی (MANUAL) تغییر یافت.*\n\n' +
      'آخرین نرخ ثبت‌شده تا زمان تنظیم نرخ جدید توسط مدیر، همچنان برای فاکتورها اعمال خواهد شد.'
    );
  }
}

/**
 * Handles the cancellation of the rate mode switch prompt.
 */
export async function handleRateModeCancelCallback(ctx: Context): Promise<void> {
  if (ctx.callbackQuery) {
    try {
      await ctx.answerCallbackQuery();
    } catch {}
  }
  await editOrReply(ctx, '❌ تغییر حالت نرخ ارز لغو شد.');
}

async function editOrReply(ctx: Context, message: string): Promise<void> {
  if (ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText(message, { parse_mode: 'Markdown' });
      return;
    } catch {
      // If edit fails (e.g. content unchanged or timeout), fallback to reply
    }
  }
  await ctx.reply(message, { parse_mode: 'Markdown' });
}
