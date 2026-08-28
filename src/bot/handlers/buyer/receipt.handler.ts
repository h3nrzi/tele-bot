import type { Context } from 'grammy';
import { TopUpService } from '@/modules/top-up/top-up.service';
import { BuyerService } from '@/modules/buyer/buyer.service';
import type { DbClient } from '@/core/database/client';
import { createAppContainer } from '@/core/di/container';
import {
  TopUpRequestExpiredError,
  NoInitiatedTopUpRequestError,
} from '@/modules/top-up/top-up.errors';
import { resolveAdminIds } from '@/bot/middleware/admin.middleware';
import {
  getReceiptSubmittedBuyerMessage,
  getReceiptExpiredMessage,
  getReceiptAlreadyPendingMessage,
  getNoActiveTopUpRequestMessage,
} from '@/bot/handlers/buyer/receipt.messages';
import {
  formatAdminReceiptNotification,
  getAdminReceiptKeyboard,
} from '@/bot/handlers/admin';

export interface PhotoHandlerDependencies {
  buyerService?: BuyerService | undefined;
  topUpService?: TopUpService | undefined;
  adminIds?: string | Set<bigint> | undefined;
  now?: Date | undefined;
}

/**
 * Handles incoming photo messages from Buyers.
 */
export async function handlePhotoMessage(
  ctx: Context,
  depsOrDb?: PhotoHandlerDependencies | DbClient,
  options?: { adminIds?: string | Set<bigint> | undefined; now?: Date | undefined }
): Promise<void> {
  const sender = ctx.from;
  if (!sender) {
    return;
  }

  const photos = ctx.message?.photo;
  if (!photos || photos.length === 0) {
    return;
  }

  const isDeps = depsOrDb && ('buyerService' in depsOrDb || 'topUpService' in depsOrDb);
  const container = isDeps
    ? null
    : createAppContainer({ dbClient: depsOrDb as DbClient, child: true });

  const buyerService = isDeps
    ? (depsOrDb as PhotoHandlerDependencies).buyerService ?? createAppContainer({ child: true }).resolve(BuyerService)
    : container!.resolve(BuyerService);

  const topUpService = isDeps
    ? (depsOrDb as PhotoHandlerDependencies).topUpService ?? createAppContainer({ child: true }).resolve(TopUpService)
    : container!.resolve(TopUpService);

  const adminIds = isDeps
    ? (depsOrDb as PhotoHandlerDependencies).adminIds
    : options?.adminIds;

  const now = isDeps
    ? (depsOrDb as PhotoHandlerDependencies).now
    : options?.now;

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
    await ctx.reply(getNoActiveTopUpRequestMessage());
    return;
  }

  if (activeRequest.status === 'PENDING') {
    await ctx.reply(getReceiptAlreadyPendingMessage());
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
    await ctx.reply(getReceiptSubmittedBuyerMessage());

    // Send push notification with receipt photo to all configured Admins
    const resolvedAdminIds = resolveAdminIds(adminIds);

    const adminCaption = formatAdminReceiptNotification({
      buyerUsername: sender.username ?? null,
      buyerChatId: sender.id,
      usdAmount: request.usdAmount,
      irrAmount: request.irrAmount,
      caption,
    });

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
