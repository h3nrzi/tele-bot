import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import type { DbClient } from '../../db/client';
import {
  submitReceipt,
  getActiveTopUpRequest,
} from '../../application/top-up/top-up.service';
import {
  TopUpRequestExpiredError,
  NoInitiatedTopUpRequestError,
} from '../../domain/top-up/top-up.errors';
import { registerBuyer } from '../../application/buyer/registration.service';
import { resolveAdminIds } from '../middleware/admin';
import { formatUsd, formatIrr } from '../../utils/currency';
import type Decimal from 'decimal.js';

export function getReceiptSubmittedBuyerMessage(): string {
  return 'رسید پرداخت شما با موفقیت ثبت شد و برای بررسی ارسال گردید. نتیجه از طریق همین پیام‌رسان به شما اعلام خواهد شد.';
}

export function getReceiptExpiredMessage(): string {
  return 'مهلت پرداخت درخواست افزایش موجودی شما به پایان رسیده است. لطفاً با دستور /topup یک درخواست جدید ثبت کنید.';
}

export function getReceiptAlreadyPendingMessage(): string {
  return 'شما قبلاً رسید پرداخت خود را ارسال کرده‌اید و درخواست شما در انتظار بررسی ادمین است.';
}

export function getNoActiveTopUpRequestMessage(): string {
  return 'شما در حال حاضر هیچ درخواست افزایش موجودی فعالی ندارید. برای شروع افزایش موجودی، دستور /topup را ارسال کنید.';
}

import type { UsdAmount, IrrAmount } from '../../domain/shared/money.vo';

export function formatAdminReceiptNotification(params: {
  buyerUsername?: string | null;
  buyerChatId: bigint | number;
  usdAmount: string | Decimal | UsdAmount;
  irrAmount: bigint | number | string | Decimal | IrrAmount;
  caption?: string | null;
}): string {
  const buyerDisplay = params.buyerUsername
    ? `@${params.buyerUsername} (شناسه: ${params.buyerChatId})`
    : `شناسه: ${params.buyerChatId}`;

  const captionLine = params.caption
    ? `\n\nتوضیحات خریدار:\n${params.caption}`
    : '';

  return (
    `📥 رسید پرداخت جدید دریافت شد\n\n` +
    `خریدار: ${buyerDisplay}\n` +
    `مبلغ درخواستی: ${formatUsd(params.usdAmount)}\n` +
    `مبلغ ریالی: ${formatIrr(params.irrAmount)} ریال` +
    captionLine
  );
}

export function getAdminReceiptKeyboard(requestId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Approve', `approve:${requestId}`)
    .text('❌ Reject', `reject:${requestId}`);
}

export interface PhotoHandlerOptions {
  adminIds?: string | Set<bigint> | undefined;
  now?: Date | undefined;
}

/**
 * Handles incoming photo messages from Buyers:
 * 1. Checks if the Buyer has an active INITIATED request.
 * 2. If no request or already PENDING, replies with a contextual message.
 * 3. Submits the receipt to transition the request to PENDING.
 * 4. If expired, informs the Buyer and updates status to EXPIRED.
 * 5. Pushes the receipt photo and inline Approve/Reject buttons to all configured Admins.
 */
export async function handlePhotoMessage(
  ctx: Context,
  dbClient?: DbClient,
  options?: PhotoHandlerOptions
): Promise<void> {
  const sender = ctx.from;
  if (!sender) {
    return;
  }

  const photos = ctx.message?.photo;
  if (!photos || photos.length === 0) {
    return;
  }

  // Use highest-resolution photo (last in array)
  const largestPhoto = photos[photos.length - 1]!;
  const fileId = largestPhoto.file_id;
  const caption = ctx.message?.caption ?? null;

  // Register / get Buyer
  const { buyer } = await registerBuyer(
    {
      telegramChatId: sender.id,
      telegramUsername: sender.username ?? null,
    },
    dbClient
  );

  // Check active request state
  const activeRequest = await getActiveTopUpRequest(buyer.id, dbClient);

  if (!activeRequest) {
    await ctx.reply(getNoActiveTopUpRequestMessage());
    return;
  }

  if (activeRequest.status === 'PENDING') {
    await ctx.reply(getReceiptAlreadyPendingMessage());
    return;
  }

  try {
    const { request } = await submitReceipt(
      {
        userId: buyer.id,
        fileId,
        caption,
      },
      dbClient,
      { now: options?.now }
    );

    // Reply to Buyer confirming receipt is under review
    await ctx.reply(getReceiptSubmittedBuyerMessage());

    // Send push notification with receipt photo to all configured Admins
    const adminIds = resolveAdminIds(options?.adminIds);

    const adminCaption = formatAdminReceiptNotification({
      buyerUsername: sender.username ?? null,
      buyerChatId: sender.id,
      usdAmount: request.usdAmount,
      irrAmount: request.irrAmount,
      caption,
    });

    const keyboard = getAdminReceiptKeyboard(request.id);

    for (const adminId of adminIds) {
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
      await ctx.reply(getReceiptExpiredMessage());
      return;
    }
    if (err instanceof NoInitiatedTopUpRequestError) {
      await ctx.reply(getNoActiveTopUpRequestMessage());
      return;
    }
    throw err;
  }
}
