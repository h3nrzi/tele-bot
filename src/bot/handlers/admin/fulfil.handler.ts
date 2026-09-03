import type { BotContext } from '@/bot/context';
import type { OrderService } from '@/modules/order/order.service';
import { FULFIL_ORDER_CONVERSATION_ID } from '@/bot/handlers/admin/fulfil.conversation';

export interface FulfilHandlerDependencies {
  orderService: OrderService;
}

/**
 * Handles the [📦 Fulfil Order] callback query from Admins (`order:fulfil:<orderId>`).
 * Validates that the tapping Admin is the one who claimed the order and that the order is PROCESSING.
 * Resets any active/dangling conversation for this Admin and enters the 3-step fulfilment conversation.
 */
export async function handleFulfilOrderCallback(
  ctx: BotContext,
  deps: FulfilHandlerDependencies
): Promise<void> {
  const sender = ctx.from;
  if (!sender) {
    return;
  }

  const callbackData = ctx.callbackQuery?.data;
  if (!callbackData) {
    return;
  }

  const match = callbackData.match(/^order:fulfil:(.+)$/);
  if (!match || !match[1]) {
    return;
  }

  const orderId = match[1];
  const { orderService } = deps;

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      orderId
    )
  ) {
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

  // Reject non-claiming Admins immediately with access denied
  if (
    order.claimedByAdminTelegramId === null ||
    order.claimedByAdminTelegramId !== BigInt(sender.id)
  ) {
    await ctx.answerCallbackQuery({
      text: '⛔ شما مجاز به تحویل این سفارش نیستید. این سفارش توسط ادمین دیگری دریافت شده است.',
      show_alert: true,
    });
    return;
  }

  // Reject orders not in PROCESSING state
  if (order.status !== 'PROCESSING') {
    await ctx.answerCallbackQuery({
      text: '⚠️ این سفارش دیگر در وضعیت در حال پردازش نیست یا قبلاً تکمیل شده است.',
      show_alert: true,
    });
    return;
  }

  // Reset any dangling conversation state before entering fresh
  try {
    await ctx.conversation.exit(FULFIL_ORDER_CONVERSATION_ID);
  } catch {}

  await ctx.conversation.enter(FULFIL_ORDER_CONVERSATION_ID);
}
