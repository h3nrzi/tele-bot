import type { Context } from 'grammy';
import type { OrderService } from '@/modules/order/order.service';
import type { AdminOrderQueueItem } from '@/modules/order/dtos/order.dto';
import { isAdmin } from '@/bot/middleware/admin.middleware';
import { formatUsd } from '@/core/shared/currency.utils';
import { formatTimeAgo } from '@/core/shared/date.utils';
import {
  getAdminOrderQueueItemKeyboard,
  formatAdminDisplay,
} from '@/bot/handlers/admin/order.keyboards';

export interface OrdersHandlerOptions {
  adminIds?: string | Set<bigint> | undefined;
  now?: Date | undefined;
}

/**
 * Formats a single active order item into a descriptive message block for Admins.
 */
export function formatAdminOrderQueueItemMessage(
  item: AdminOrderQueueItem,
  currentAdminTelegramId: bigint | number | string,
  now?: Date
): string {
  const shortOrderId = item.id.slice(0, 8);
  const buyerDisplay = item.buyerTelegramUsername
    ? `@${item.buyerTelegramUsername} (شناسه: ${item.buyerTelegramChatId})`
    : `شناسه: ${item.buyerTelegramChatId}`;
  const priceDisplay = formatUsd(item.usdPriceSnapshot);
  const timeDisplay = formatTimeAgo(item.createdAt, now);

  let statusDisplay = '';
  let claimDisplay = '';

  if (item.status === 'PLACED') {
    statusDisplay = '⏳ در انتظار شروع پردازش (PLACED)';
  } else if (item.status === 'PROCESSING') {
    statusDisplay = '🔄 در حال پردازش (PROCESSING)';
    const isClaimedByMe =
      item.claimedByAdminTelegramId !== null &&
      item.claimedByAdminTelegramId !== undefined &&
      BigInt(item.claimedByAdminTelegramId) === BigInt(currentAdminTelegramId);

    if (isClaimedByMe) {
      claimDisplay = '\n👤 *مسئول پردازش:* شما';
    } else if (item.claimedByAdminUsername) {
      claimDisplay = `\n👤 *مسئول پردازش:* ${formatAdminDisplay(item.claimedByAdminUsername)}`;
    } else if (item.claimedByAdminTelegramId) {
      claimDisplay = `\n👤 *مسئول پردازش:* ${formatAdminDisplay(String(item.claimedByAdminTelegramId))}`;
    }
  }

  return (
    `📦 *سفارش #${shortOrderId}*\n\n` +
    `🛍️ *خدمت:* ${item.catalogItemName}\n` +
    `💰 *مبلغ:* ${priceDisplay}\n` +
    `👤 *خریدار:* ${buyerDisplay}\n` +
    `📊 *وضعیت:* ${statusDisplay}` +
    claimDisplay +
    `\n🕒 *زمان ثبت:* ${timeDisplay}`
  );
}

/**
 * Handles the /orders Admin command.
 * Restricts access to configured Admin users.
 * Returns a live list of all active orders (`PLACED` and `PROCESSING`) with appropriate inline action buttons.
 */
export async function handleOrdersCommand(
  ctx: Context,
  orderService: OrderService,
  options?: OrdersHandlerOptions
): Promise<void> {
  const senderId = ctx.from?.id;

  if (!isAdmin(senderId, options?.adminIds)) {
    await ctx.reply('⛔ دسترسی غیرمجاز. این دستور فقط برای مدیران سیستم قابل استفاده است.');
    return;
  }

  const activeOrders = await orderService.getAdminOrderQueue();

  if (activeOrders.length === 0) {
    await ctx.reply('📥 در حال حاضر هیچ سفارش فعالی در صف وجود ندارد.');
    return;
  }

  for (const item of activeOrders) {
    const messageText = formatAdminOrderQueueItemMessage(
      item,
      senderId!,
      options?.now
    );

    const keyboard = getAdminOrderQueueItemKeyboard({
      orderId: item.id,
      status: item.status,
      claimedByAdminTelegramId: item.claimedByAdminTelegramId,
      currentAdminTelegramId: senderId!,
      claimedByAdminDisplay: item.claimedByAdminUsername ?? undefined,
    });

    await ctx.reply(messageText, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  }
}
