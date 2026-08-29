import type { Context } from 'grammy';
import type { BuyerService } from '@/modules/buyer/buyer.service';
import { isAdmin } from '@/bot/middleware/admin.middleware';
import { formatUsd } from '@/core/shared/currency.utils';
import {
  getBuyerMainMenuKeyboard,
  getAdminMainMenuKeyboard,
} from '@/bot/keyboards/menu.keyboards';

export interface StartHandlerOptions {
  adminIds?: string | Set<bigint> | undefined;
}

/**
 * Handles the /start command.
 */
export async function handleStart(
  ctx: Context,
  buyerService: BuyerService,
  options?: StartHandlerOptions
): Promise<void> {
  if (!ctx.from) {
    return;
  }

  const displayName =
    ctx.from.first_name?.trim() ||
    (ctx.from.username ? `@${ctx.from.username}` : null);

  if (isAdmin(ctx.from.id, options?.adminIds)) {
    const greeting = displayName ? `سلام ${displayName} (ادمین گرامی)!` : `سلام ادمین گرامی!`;
    await ctx.reply(
      `${greeting}\nبه پنل مدیریت Tele-Bot خوش آمدید.\n\n` +
      `از منوی زیر می‌توانید نرخ ارز، کارت بانکی و صف درخواست‌های افزایش موجودی را مدیریت کنید:`,
      {
        reply_markup: getAdminMainMenuKeyboard(),
      }
    );
    return;
  }

  const result = await buyerService.register({
    telegramChatId: ctx.from.id,
    telegramUsername: ctx.from.username ?? null,
  });

  if (result.isNew) {
    await ctx.reply(
      `سلام! به Tele-Bot خوش آمدید.\n\n` +
      `کیف پول شما با موفقیت ایجاد شد.\n` +
      `موجودی فعلی شما: ${formatUsd('0.00')}\n\n` +
      `از دکمه‌های زیر برای دسترسی به امکانات استفاده کنید.`,
      {
        reply_markup: getBuyerMainMenuKeyboard(),
      }
    );
  } else {
    const greeting = displayName ? `سلام ${displayName} عزیز!` : `سلام!`;
    await ctx.reply(
      `${greeting}\nبه Tele-Bot خوش آمدید.\n\n` +
      `موجودی کیف پول شما: ${formatUsd(result.wallet.availableBalance)}\n\n` +
      `از منوی زیر گزینه مورد نظر خود را انتخاب کنید:`,
      {
        reply_markup: getBuyerMainMenuKeyboard(),
      }
    );
  }
}
