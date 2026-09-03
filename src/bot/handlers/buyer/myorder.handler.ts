import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import type { OrderService } from '@/modules/order/order.service';
import { buildMyOrderView } from '@/bot/handlers/buyer/order.keyboards';
import {
  getAdminOrderCancelledKeyboard,
  editAdminOrderNotificationMessages,
} from '@/bot/handlers/admin/order.keyboards';
import { formatUsd } from '@/core/shared/currency.utils';
import { isValidUuid } from '@/core/shared/telegram.utils';
import {
  InvalidOrderStatusError,
  OrderNotFoundError,
  OrderNotOwnedByBuyerError,
} from '@/modules/order/order.errors';

export interface BuyerCancelOrderDependencies {
  orderService: OrderService;
}

/**
 * Handles the /myorder Buyer command and menu buttons.
 * Displays the most recent Order status, Catalog Item name, and Price Snapshot.
 */
export async function handleMyOrderCommand(
  ctx: Context,
  orderService: OrderService
): Promise<void> {
  const sender = ctx.from;
  if (!sender) {
    return;
  }

  const latestResult = await orderService.getLatestOrderForBuyer({
    telegramChatId: sender.id,
  });

  const { messageText, keyboard } = buildMyOrderView(
    latestResult?.order ?? null,
    latestResult?.catalogItem ?? null
  );

  await ctx.reply(messageText, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
}

/**
 * Handles the [❌ لغو سفارش] callback query from a Buyer (order:cancel:<orderId>).
 * Cancels the Order, triggers immediate double-entry refund, restores Buyer balance,
 * edits Admin notifications to remove action buttons, and displays confirmation to Buyer.
 */
export async function handleBuyerCancelOrderCallback(
  ctx: Context,
  deps: BuyerCancelOrderDependencies
): Promise<void> {
  const sender = ctx.from;
  if (!sender) {
    return;
  }

  const callbackData = ctx.callbackQuery?.data;
  const match = callbackData?.match(/^order:cancel:(.+)$/);
  if (!match || !match[1]) {
    return;
  }

  const orderId = match[1];
  const { orderService } = deps;

  if (!isValidUuid(orderId)) {
    try {
      await ctx.answerCallbackQuery({
        text: '⚠️ سفارش مورد نظر یافت نشد.',
        show_alert: true,
      });
    } catch {}
    return;
  }

  try {
    const result = await orderService.cancelOrder(
      {
        orderId,
        telegramChatId: sender.id,
      },
      {
        updateAdminNotifications: async (context) => {
          const cancelledKeyboard = getAdminOrderCancelledKeyboard();
          await editAdminOrderNotificationMessages(
            ctx.api,
            context.notifications,
            cancelledKeyboard
          );
        },
      }
    );

    const successMessage =
      `✅ *سفارش شما با موفقیت لغو شد*\n\n` +
      `🆔 شناسه سفارش: #${result.order.id}\n` +
      `💵 مبلغ بازگشت داده شده: ${formatUsd(result.order.usdPriceSnapshot)}\n` +
      `💰 موجودی فعلی کیف پول شما: ${formatUsd(result.wallet.availableBalance)}\n\n` +
      `مبلغ سفارش بلافاصله به موجودی کیف پول شما بازگردانده شد.`;

    try {
      await ctx.editMessageText(successMessage, {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard(),
      });
    } catch {
      await ctx.reply(successMessage, { parse_mode: 'Markdown' });
    }

    try {
      await ctx.answerCallbackQuery({
        text: '✅ سفارش با موفقیت لغو شد.',
      });
    } catch {}
  } catch (err: any) {
    if (err instanceof InvalidOrderStatusError) {
      try {
        await ctx.answerCallbackQuery({
          text: '⚠️ امکان لغو این سفارش وجود ندارد (سفارش در حال پردازش یا تکمیل شده است).',
          show_alert: true,
        });
      } catch {}
      return;
    }

    if (err instanceof OrderNotOwnedByBuyerError) {
      try {
        await ctx.answerCallbackQuery({
          text: '⚠️ شما دسترسی لازم برای لغو این سفارش را ندارید.',
          show_alert: true,
        });
      } catch {}
      return;
    }

    if (err instanceof OrderNotFoundError) {
      try {
        await ctx.answerCallbackQuery({
          text: '⚠️ سفارش مورد نظر یافت نشد.',
          show_alert: true,
        });
      } catch {}
      return;
    }

    console.error(`Failed to cancel order ${orderId}:`, err);
    try {
      await ctx.answerCallbackQuery({
        text: '❌ خطایی در لغو سفارش رخ داد.',
        show_alert: true,
      });
    } catch {}
  }
}
