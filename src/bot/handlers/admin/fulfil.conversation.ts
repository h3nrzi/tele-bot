import type { Context } from 'grammy';
import type { BotConversation } from '@/bot/context';
import type { OrderService } from '@/modules/order/order.service';
import { isCancelCommand } from '@/core/shared/telegram.utils';
import {
  getFulfilOrderConfirmationKeyboard,
  getAdminOrderFulfilledKeyboard,
} from '@/bot/handlers/admin/order.keyboards';

export type FulfilOrderConversation = BotConversation;
export const FULFIL_ORDER_CONVERSATION_ID = 'fulfil_order';

/**
 * Creates the grammY 3-step conversation for Admin order fulfilment:
 * Step 1 — Input: prompts Admin for Delivery Content.
 * Step 2 — Preview & Confirm: echoes content with [✓ Send] and [✗ Re-enter] (Re-enter loops back to Step 1).
 * Step 3 — Commit: runs fulfilOrder, forwards content to Buyer, and updates Admin notifications.
 */
export function createFulfilOrderConversation(orderService: OrderService) {
  return async function fulfilOrderConversation(
    conversation: FulfilOrderConversation,
    ctx: Context
  ): Promise<void> {
    const sender = ctx.from;
    if (!sender) {
      return;
    }

    const callbackData = ctx.callbackQuery?.data;
    const match = callbackData?.match(/^order:fulfil:(.+)$/);
    if (!match || !match[1]) {
      return;
    }

    const orderId = match[1];
    const adminDisplay = sender.username
      ? `@${sender.username}`
      : sender.first_name || String(sender.id);

    if (ctx.callbackQuery) {
      try {
        await ctx.answerCallbackQuery();
      } catch {}
    }

    // Step 1: Input & Step 2: Preview loop
    let deliveryContent = '';

    const shortOrderId = orderId.slice(0, 8);

    while (true) {
      await ctx.reply(
        `📦 تحویل سفارش #${shortOrderId}\n\n` +
        `لطفاً اطلاعات یا محتوای تحویل سفارش (اکانت، لایسنس، اطلاعات دسترسی یا توضیحات) را برای ارسال به خریدار تایپ و ارسال کنید:\n\n` +
        `(برای انصراف /cancel را ارسال نمایید)`
      );

      const inputCtx = await conversation.wait();
      const inputText = inputCtx.message?.text ?? '';
      const inputCallback = inputCtx.callbackQuery?.data;

      if (inputCallback === 'flow:cancel' || isCancelCommand(inputText)) {
        if (inputCtx.callbackQuery) {
          try {
            await inputCtx.answerCallbackQuery();
          } catch {}
        }
        await inputCtx.reply('❌ عملیات تحویل سفارش لغو شد.');
        return;
      }

      if (!inputText.trim()) {
        await inputCtx.reply('❌ محتوای تحویل نمی‌تواند خالی باشد.');
        continue;
      }

      deliveryContent = inputText.trim();

      // Step 2: Preview & Confirm
      await inputCtx.reply(
        `📋 پیش‌نمایش متن تحویل سفارش:\n\n` +
        `«${deliveryContent}»\n\n` +
        `آیا مایل به ارسال این اطلاعات برای خریدار هستید؟`,
        {
          reply_markup: getFulfilOrderConfirmationKeyboard(),
        }
      );

      const confirmCtx = await conversation.wait();
      const confirmText = confirmCtx.message?.text ?? '';
      const confirmCallback = confirmCtx.callbackQuery?.data;

      if (confirmCallback === 'flow:cancel' || isCancelCommand(confirmText)) {
        if (confirmCtx.callbackQuery) {
          try {
            await confirmCtx.answerCallbackQuery();
          } catch {}
        }
        await confirmCtx.reply('❌ عملیات تحویل سفارش لغو شد.');
        return;
      }

      if (
        confirmCallback === 'fulfil:reenter' ||
        confirmText.toLowerCase() === 're-enter' ||
        confirmText === 'ویرایش'
      ) {
        if (confirmCtx.callbackQuery) {
          try {
            await confirmCtx.answerCallbackQuery();
          } catch {}
        }
        continue;
      }

      if (
        confirmCallback === 'fulfil:confirm' ||
        confirmText.toLowerCase() === 'send' ||
        confirmText === 'ارسال' ||
        confirmText === 'تایید'
      ) {
        if (confirmCtx.callbackQuery) {
          try {
            await confirmCtx.answerCallbackQuery();
          } catch {}
        }
        break;
      }

      await confirmCtx.reply('❌ عملیات تحویل سفارش لغو شد.');
      return;
    }

    // Step 3: Commit
    try {
      await conversation.external(async () => {
        await orderService.fulfilOrder(
          {
            orderId,
            adminTelegramId: sender.id,
            deliveryContent,
          },
          {
            notifyBuyer: async ({ buyer, deliveryContent: content }) => {
              const buyerMessage =
                `📦 سفارش شما با موفقیت تحویل داده شد!\n\n` +
                `اطلاعات تحویل سفارش:\n` +
                `${content}\n\n` +
                `با تشکر از خرید شما.`;
              await ctx.api.sendMessage(
                buyer.telegramChatId.toString(),
                buyerMessage
              );
            },
            updateAdminNotifications: async ({ notifications }) => {
              const fulfilledKeyboard =
                getAdminOrderFulfilledKeyboard(adminDisplay);
              for (const notif of notifications) {
                try {
                  await ctx.api.editMessageReplyMarkup(
                    Number(notif.chatId),
                    Number(notif.messageId),
                    {
                      reply_markup: fulfilledKeyboard,
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
      });

      await ctx.reply('✅ سفارش با موفقیت تحویل داده شد و محتوا برای خریدار ارسال گردید.');
    } catch (err: any) {
      console.error('Failed to fulfil order in conversation:', err);
      await ctx.reply('❌ خطایی در ثبت تحویل سفارش رخ داد.');
    }
  };
}
