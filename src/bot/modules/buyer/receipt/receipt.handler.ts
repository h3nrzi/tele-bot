import type { Context } from 'grammy';
import type { DbClient } from '../../../../db/client';
import {
  submitReceipt,
  getActiveTopUpRequest,
} from '../../../../application/top-up/top-up.service';
import {
  TopUpRequestExpiredError,
  NoInitiatedTopUpRequestError,
} from '../../../../domain/top-up/top-up.errors';
import { registerBuyer } from '../../../../application/buyer/registration.service';
import { resolveAdminIds } from '../../../core/middleware/admin.middleware';
import {
  getReceiptSubmittedBuyerMessage,
  getReceiptExpiredMessage,
  getReceiptAlreadyPendingMessage,
  getNoActiveTopUpRequestMessage,
} from './receipt.messages';
import { formatAdminReceiptNotification } from '../../admin/top-up-approval/approval.messages';
import { getAdminReceiptKeyboard } from '../../admin/top-up-approval/approval.keyboards';

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
