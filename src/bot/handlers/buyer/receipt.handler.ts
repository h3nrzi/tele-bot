import type { Context } from 'grammy';
import type { TopUpService } from '@/modules/top-up/top-up.service';
import type { BuyerService } from '@/modules/buyer/buyer.service';
import {
  TopUpRequestExpiredError,
  NoInitiatedTopUpRequestError,
} from '@/modules/top-up/top-up.errors';
import { resolveAdminIds } from '@/bot/middleware/admin.middleware';
import { formatUsd, formatIrr } from '@/core/shared/currency.utils';
import { getAdminReceiptKeyboard } from '@/bot/handlers/admin';

export interface PhotoHandlerDependencies {
  buyerService: BuyerService;
  topUpService: TopUpService;
  adminIds?: string | Set<bigint> | undefined;
  now?: Date | undefined;
}

/**
 * Handles incoming photo messages from Buyers.
 */
export async function handlePhotoMessage(
  ctx: Context,
  deps: PhotoHandlerDependencies
): Promise<void> {
  const sender = ctx.from;
  if (!sender) {
    return;
  }

  const photos = ctx.message?.photo;
  if (!photos || photos.length === 0) {
    return;
  }

  const { buyerService, topUpService, adminIds, now } = deps;

  // Use highest-resolution photo (last in array)
  const largestPhoto = photos[photos.length - 1]!;
  const fileId = largestPhoto.file_id;
  const caption = ctx.message?.caption ?? null;

  // Register / get Buyer
  const { buyer } = await buyerService.register({
    telegramChatId: sender.id,
    telegramUsername: sender.username ?? null,
  });

  // Check active request state
  const activeRequest = await topUpService.getActiveTopUpRequest(buyer.id);

  if (!activeRequest) {
    await ctx.reply(
      'شما در حال حاضر هیچ درخواست افزایش موجودی فعالی ندارید. برای شروع افزایش موجودی، دستور /topup را ارسال کنید.'
    );
    return;
  }

  if (activeRequest.status === 'PENDING') {
    await ctx.reply(
      'شما قبلاً رسید پرداخت خود را ارسال کرده‌اید و درخواست شما در انتظار بررسی ادمین است.'
    );
    return;
  }

  try {
    const { request } = await topUpService.submitReceipt(
      {
        userId: buyer.id,
        fileId,
        caption,
      },
      { now }
    );

    // Reply to Buyer confirming receipt is under review
    await ctx.reply(
      'رسید پرداخت شما با موفقیت ثبت شد و برای بررسی ارسال گردید. نتیجه از طریق همین پیام‌رسان به شما اعلام خواهد شد.'
    );

    // Send push notification with receipt photo to all configured Admins
    const resolvedAdminIds = resolveAdminIds(adminIds);

    const buyerDisplay = sender.username
      ? `@${sender.username} (شناسه: ${sender.id})`
      : `شناسه: ${sender.id}`;
    const captionLine = caption ? `\n\nتوضیحات خریدار:\n${caption}` : '';

    const adminCaption =
      `📥 رسید پرداخت جدید دریافت شد\n\n` +
      `خریدار: ${buyerDisplay}\n` +
      `مبلغ درخواستی: ${formatUsd(request.usdAmount)}\n` +
      `مبلغ ریالی: ${formatIrr(request.irrAmount)} ریال` +
      captionLine;

    const keyboard = getAdminReceiptKeyboard(request.id);

    for (const adminId of resolvedAdminIds) {
      try {
        await ctx.api.sendPhoto(Number(adminId), fileId, {
          caption: adminCaption,
          reply_markup: keyboard,
        });
      } catch (err) {
        console.error(
          `Failed to send receipt photo notification to admin ${adminId}:`,
          err
        );
      }
    }
  } catch (err: any) {
    if (err instanceof TopUpRequestExpiredError) {
      await ctx.reply(
        'مهلت پرداخت درخواست افزایش موجودی شما به پایان رسیده است. لطفاً با دستور /topup یک درخواست جدید ثبت کنید.'
      );
      return;
    }
    if (err instanceof NoInitiatedTopUpRequestError) {
      await ctx.reply(
        'شما در حال حاضر هیچ درخواست افزایش موجودی فعالی ندارید. برای شروع افزایش موجودی، دستور /topup را ارسال کنید.'
      );
      return;
    }
    throw err;
  }
}
