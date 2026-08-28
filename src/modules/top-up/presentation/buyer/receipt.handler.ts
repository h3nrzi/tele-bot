import type { Context } from 'grammy';
import type { TopUpService } from '@/modules/top-up/top-up.service';
import type { BuyerService } from '@/modules/buyer/buyer.service';
import {
  TopUpRequestExpiredError,
  NoInitiatedTopUpRequestError,
} from '@/modules/top-up/top-up.errors';
import { resolveAdminIds } from '@/core/bot/middleware/admin.middleware';
import {
  getReceiptSubmittedBuyerMessage,
  getReceiptExpiredMessage,
  getReceiptAlreadyPendingMessage,
  getNoActiveTopUpRequestMessage,
} from '@/modules/top-up/presentation/buyer/receipt.messages';
import { formatAdminReceiptNotification } from '@/modules/top-up/presentation/admin/approval.messages';
import { getAdminReceiptKeyboard } from '@/modules/top-up/presentation/admin/approval.keyboards';

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

  // Use highest-resolution photo (last in array)
  const largestPhoto = photos[photos.length - 1]!;
  const fileId = largestPhoto.file_id;
  const caption = ctx.message?.caption ?? null;

  // Register / get Buyer
  const { buyer } = await deps.buyerService.register({
    telegramChatId: sender.id,
    telegramUsername: sender.username ?? null,
  });

  // Check active request state
  const activeRequest = await deps.topUpService.getActiveTopUpRequest(buyer.id);

  if (!activeRequest) {
    await ctx.reply(getNoActiveTopUpRequestMessage());
    return;
  }

  if (activeRequest.status === 'PENDING') {
    await ctx.reply(getReceiptAlreadyPendingMessage());
    return;
  }

  try {
    const { request } = await deps.topUpService.submitReceipt(
      {
        userId: buyer.id,
        fileId,
        caption,
      },
      { now: deps.now }
    );

    // Reply to Buyer confirming receipt is under review
    await ctx.reply(getReceiptSubmittedBuyerMessage());

    // Send push notification with receipt photo to all configured Admins
    const adminIds = resolveAdminIds(deps.adminIds);

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
