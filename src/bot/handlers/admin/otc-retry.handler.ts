import type { Context } from 'grammy';
import type { OtcPurchaseService } from '@/modules/otc-purchase/otc-purchase.service';
import {
  DuplicateActiveOtcPurchaseError,
  InvalidOtcPurchaseStateError,
  OtcPurchaseNotFoundError,
} from '@/modules/otc-purchase/otc-purchase.errors';

export interface OtcRetryHandlerDependencies {
  otcPurchaseService: OtcPurchaseService;
}

/**
 * Handles inline [🔁 تلاش مجدد] (otc:retry:<purchaseId>) callback queries from Admins.
 */
export async function handleOtcRetryCallback(
  ctx: Context,
  deps: OtcRetryHandlerDependencies
): Promise<void> {
  const sender = ctx.from;
  if (!sender) {
    return;
  }

  const callbackData = ctx.callbackQuery?.data;
  if (!callbackData) {
    return;
  }

  const match = callbackData.match(/^otc:retry:(.+)$/);
  if (!match || !match[1]) {
    await ctx.answerCallbackQuery({
      text: '❌ شناسه درخواست نامعتبر است.',
      show_alert: true,
    });
    return;
  }

  const purchaseId = match[1];

  try {
    await deps.otcPurchaseService.retry(purchaseId);

    await ctx.answerCallbackQuery({
      text: '⏳ در حال تلاش مجدد برای خرید ارز از والکس...',
    });
  } catch (err: any) {

    if (err instanceof DuplicateActiveOtcPurchaseError) {
      await ctx.answerCallbackQuery({
        text: '⚠️ این خرید در حال حاضر در حال انجام است یا قبلاً تکمیل شده است.',
        show_alert: true,
      });
      return;
    }

    if (err instanceof InvalidOtcPurchaseStateError) {
      await ctx.answerCallbackQuery({
        text: '✅ این خرید قبلاً با موفقیت انجام شده است.',
        show_alert: true,
      });
      return;
    }

    if (err instanceof OtcPurchaseNotFoundError) {
      await ctx.answerCallbackQuery({
        text: '❌ رکورد خرید یافت نشد.',
        show_alert: true,
      });
      return;
    }

    console.error('Unexpected error in handleOtcRetryCallback:', err);
    await ctx.answerCallbackQuery({
      text: '❌ خطایی در پردازش تلاش مجدد رخ داد.',
      show_alert: true,
    });
  }
}
