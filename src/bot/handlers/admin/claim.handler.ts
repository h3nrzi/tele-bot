import type { Context } from 'grammy';
import type { OrderService } from '@/modules/order/order.service';
import { getAdminOrderProcessingKeyboard } from '@/bot/handlers/admin/order.keyboards';
import {
  OrderAlreadyClaimedError,
  InvalidOrderStatusError,
  OrderNotFoundError,
} from '@/modules/order/order.errors';

export interface ClaimHandlerDependencies {
  orderService: OrderService;
}

/**
 * Handles the [▶ Start Processing] callback query from Admins (`order:process:<orderId>`).
 * Instantly transitions the order to PROCESSING, sets claimedByAdminTelegramId and claimedAt,
 * and updates every Admin's notification message with the new button set.
 */
export async function handleClaimOrderCallback(
  ctx: Context,
  deps: ClaimHandlerDependencies
): Promise<void> {
  const sender = ctx.from;
  if (!sender) {
    return;
  }

  const callbackData = ctx.callbackQuery?.data;
  if (!callbackData) {
    return;
  }

  const match = callbackData.match(/^order:process:(.+)$/);
  if (!match || !match[1]) {
    return;
  }

  const orderId = match[1];
  const { orderService } = deps;
  const adminUsername = sender.username
    ? `@${sender.username}`
    : sender.first_name || String(sender.id);

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

  try {
    await orderService.claimOrder(
      {
        orderId,
        adminTelegramId: sender.id,
        adminUsername,
      },
      {
        updateAdminNotifications: async (context) => {
          const displayHandle =
            context.claimedByAdminUsername ||
            String(context.claimedByAdminTelegramId);
          const processingKeyboard = getAdminOrderProcessingKeyboard(
            context.order.id,
            displayHandle
          );

          for (const notif of context.notifications) {
            try {
              await ctx.api.editMessageReplyMarkup(
                Number(notif.chatId),
                Number(notif.messageId),
                {
                  reply_markup: processingKeyboard,
                }
              );
            } catch (editErr) {
              console.error(
                `Failed to edit notification for admin ${notif.adminTelegramId}:`,
                editErr
              );
            }
          }
        },
      }
    );

    // Answer callback query with confirmation
    await ctx.answerCallbackQuery({
      text: '✅ شروع پردازش سفارش با موفقیت ثبت شد.',
    });
  } catch (err: any) {
    if (err instanceof OrderAlreadyClaimedError) {
      await ctx.answerCallbackQuery({
        text: '⚠️ این سفارش قبلاً توسط ادمین دیگری دریافت شده است.',
        show_alert: true,
      });
      return;
    }

    if (err instanceof InvalidOrderStatusError) {
      await ctx.answerCallbackQuery({
        text: '⚠️ این سفارش دیگر در وضعیت قابل دریافت نیست یا قبلاً تعیین تکلیف شده است.',
        show_alert: true,
      });
      return;
    }

    if (err instanceof OrderNotFoundError) {
      await ctx.answerCallbackQuery({
        text: '⚠️ سفارش مورد نظر یافت نشد.',
        show_alert: true,
      });
      return;
    }

    console.error('Unexpected error in handleClaimOrderCallback:', err);
    await ctx.answerCallbackQuery({
      text: '❌ خطایی در دریافت سفارش رخ داد.',
      show_alert: true,
    });
  }
}
