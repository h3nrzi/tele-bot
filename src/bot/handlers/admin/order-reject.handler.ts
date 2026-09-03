import type { BotContext } from '@/bot/context';
import type { OrderService } from '@/modules/order/order.service';
import { REJECT_ORDER_CONVERSATION_ID } from '@/bot/handlers/admin/order-reject.conversation';
import { isValidUuid } from '@/core/shared/telegram.utils';

export interface RejectOrderHandlerDependencies {
  orderService: OrderService;
}

/**
 * Handles the [✗ Reject] callback query from Admins (`order:reject:<orderId>`).
 * Actionable from both PLACED and PROCESSING states by any configured Admin.
 * Validates order status, clears dangling conversations, and enters the rejection conversation.
 */
export async function handleRejectOrderCallback(
  ctx: BotContext,
  deps: RejectOrderHandlerDependencies
): Promise<void> {
  const sender = ctx.from;
  if (!sender) {
    return;
  }

  const callbackData = ctx.callbackQuery?.data;
  if (!callbackData) {
    return;
  }

  const match = callbackData.match(/^order:reject:(.+)$/);
  if (!match || !match[1]) {
    return;
  }

  const orderId = match[1];
  const { orderService } = deps;

  if (!isValidUuid(orderId)) {
    await ctx.answerCallbackQuery({
      text: '⚠️ سفارش مورد نظر یافت نشد.',
      show_alert: true,
    });
    return;
  }


  const order = await orderService.findById(orderId);
  if (!order) {
    await ctx.answerCallbackQuery({
      text: '⚠️ سفارش مورد نظر یافت نشد.',
      show_alert: true,
    });
    return;
  }

  // Reject orders not in PLACED or PROCESSING state
  if (order.status !== 'PLACED' && order.status !== 'PROCESSING') {
    await ctx.answerCallbackQuery({
      text: '⚠️ این سفارش قبلاً تعیین تکلیف شده است یا در وضعیت قابل رد کردن نیست.',
      show_alert: true,
    });
    return;
  }

  // Reset any dangling conversation state before entering fresh
  try {
    await ctx.conversation.exit(REJECT_ORDER_CONVERSATION_ID);
  } catch {}

  await ctx.conversation.enter(REJECT_ORDER_CONVERSATION_ID);
}
