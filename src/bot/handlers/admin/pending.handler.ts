import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import type { TopUpService } from '@/modules/top-up/top-up.service';
import {
  getEmptyPendingQueueMessage,
  formatPendingQueuePage,
} from '@/bot/handlers/admin/pending.messages';
import { getPendingQueueKeyboard } from '@/bot/handlers/admin/pending.keyboards';
import { formatAdminReceiptNotification } from '@/bot/handlers/admin/approval.messages';
import { getAdminReceiptKeyboard } from '@/bot/handlers/admin/approval.keyboards';

export const PENDING_PAGE_SIZE = 10;

export interface PendingHandlerOptions {
  now?: Date | undefined;
}

interface PendingQueueView {
  messageText: string;
  keyboard: InlineKeyboard;
}

function buildPendingQueueView(
  pendingRequests: Awaited<ReturnType<TopUpService['getPendingRequests']>>,
  targetPage = 1,
  now?: Date
): PendingQueueView {
  const totalCount = pendingRequests.length;
  const totalPages = Math.ceil(totalCount / PENDING_PAGE_SIZE);
  const page = Math.max(1, Math.min(targetPage, totalPages));
  const startIndex = (page - 1) * PENDING_PAGE_SIZE;
  const itemsOnPage = pendingRequests.slice(
    startIndex,
    startIndex + PENDING_PAGE_SIZE
  );

  const messageText = formatPendingQueuePage({
    items: itemsOnPage,
    page,
    totalPages,
    totalCount,
    startIndex,
    now,
  });

  const keyboard = getPendingQueueKeyboard({
    items: itemsOnPage,
    page,
    totalPages,
    startIndex,
  });

  return { messageText, keyboard };
}

/**
 * Handles the /pending Admin command.
 */
export async function handlePending(
  ctx: Context,
  service: TopUpService,
  options?: PendingHandlerOptions
): Promise<void> {
  const sender = ctx.from;
  if (!sender) {
    return;
  }

  const pendingRequests = await service.getPendingRequests();

  if (pendingRequests.length === 0) {
    await ctx.reply(getEmptyPendingQueueMessage());
    return;
  }

  const { messageText, keyboard } = buildPendingQueueView(
    pendingRequests,
    1,
    options?.now
  );

  await ctx.reply(messageText, {
    reply_markup: keyboard,
  });
}

/**
 * Handles pagination navigation callback queries (pending_page:<page>).
 */
export async function handlePendingPage(
  ctx: Context,
  service: TopUpService,
  options?: PendingHandlerOptions
): Promise<void> {
  const sender = ctx.from;
  if (!sender) {
    return;
  }

  const callbackData = ctx.callbackQuery?.data;
  const match = callbackData?.match(/^pending_page:(\d+)$/);
  if (!match || !match[1]) {
    return;
  }

  const targetPage = parseInt(match[1], 10);

  const pendingRequests = await service.getPendingRequests();

  if (pendingRequests.length === 0) {
    try {
      await ctx.editMessageText(getEmptyPendingQueueMessage(), {
        reply_markup: new InlineKeyboard(),
      });
    } catch {}
    try {
      await ctx.answerCallbackQuery();
    } catch {}
    return;
  }

  const { messageText, keyboard } = buildPendingQueueView(
    pendingRequests,
    targetPage,
    options?.now
  );

  try {
    await ctx.editMessageText(messageText, {
      reply_markup: keyboard,
    });
  } catch (editErr) {
    console.error('Failed to edit pending queue page:', editErr);
  }

  try {
    await ctx.answerCallbackQuery();
  } catch {}
}

/**
 * Handles inline Review button callback queries (review:<requestId>).
 */
export async function handleReviewCallback(
  ctx: Context,
  service: TopUpService
): Promise<void> {
  const sender = ctx.from;
  if (!sender) {
    return;
  }

  const callbackData = ctx.callbackQuery?.data;
  const match = callbackData?.match(/^review:(.+)$/);
  if (!match || !match[1]) {
    return;
  }

  const requestId = match[1];

  const req = await service.getPendingRequestById(requestId);

  if (!req) {
    try {
      await ctx.answerCallbackQuery({
        text: '⚠️ درخواست یافت نشد.',
        show_alert: true,
      });
    } catch {}
    return;
  }

  const caption = formatAdminReceiptNotification({
    buyerUsername: req.telegramUsername,
    buyerChatId: req.telegramChatId,
    usdAmount: req.usdAmount,
    irrAmount: req.irrAmount,
    caption: req.receiptCaption,
  });

  const keyboard = getAdminReceiptKeyboard(req.id);

  try {
    if (req.receiptFileId) {
      await ctx.api.sendPhoto(sender.id, req.receiptFileId, {
        caption,
        reply_markup: keyboard,
      });
    } else {
      await ctx.api.sendMessage(sender.id, caption, {
        reply_markup: keyboard,
      });
    }
  } catch (sendErr) {
    console.error(`Failed to send receipt review to admin ${sender.id}:`, sendErr);
  }

  try {
    await ctx.answerCallbackQuery();
  } catch {}
}
