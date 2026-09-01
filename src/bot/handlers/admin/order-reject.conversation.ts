import type { Context } from 'grammy';
import type { BotConversation } from '@/bot/context';
import type { OrderService } from '@/modules/order/order.service';
import { isCancelCommand } from '@/core/shared/telegram.utils';
import {
  ORDER_REJECTION_CATEGORIES,
  type OrderRejectionCategoryCode,
  getOrderRejectionCategoriesKeyboard,
  getOrderRejectionNotePromptKeyboard,
  getAdminOrderRejectedKeyboard,
  editAdminOrderNotificationMessages,
} from '@/bot/handlers/admin/order.keyboards';

import {
  InvalidOrderStatusError,
  OrderNotFoundError,
  OrderRejectionNoteRequiredError,
} from '@/modules/order/order.errors';

export type RejectOrderConversation = BotConversation;
export const REJECT_ORDER_CONVERSATION_ID = 'reject_order';

/**
 * Creates the grammY conversation for Admin order rejection flow:
 * Step 1 — Category selection: presents 5 preset category buttons.
 * Step 2 — Note prompt:
 *          - If OTHER is selected, text note is mandatory (no Skip button).
 *          - If preset is selected, text note is optional with [Skip] button.
 * Step 3 — Execution: runs rejection service, refunds balance, notifies Buyer, and updates Admin notifications.
 */
export function createRejectOrderConversation(orderService: OrderService) {
  return async function rejectOrderConversation(
    conversation: RejectOrderConversation,
    ctx: Context
  ): Promise<void> {
    const sender = ctx.from;
    if (!sender) {
      return;
    }

    const callbackData = ctx.callbackQuery?.data;
    const match = callbackData?.match(/^order:reject:(.+)$/);
    if (!match || !match[1]) {
      return;
    }

    const orderId = match[1];
    const shortOrderId = orderId.slice(0, 8);
    const adminDisplay = sender.username
      ? `@${sender.username}`
      : sender.first_name || String(sender.id);

    if (ctx.callbackQuery) {
      try {
        await ctx.answerCallbackQuery();
      } catch {}
    }

    // Step 1: Category Selection
    await ctx.reply(
      `❌ *رد سفارش #${shortOrderId}*\n\n` +
      `لطفاً علت رد سفارش را از گزینه‌های زیر انتخاب کنید:`,
      {
        parse_mode: 'Markdown',
        reply_markup: getOrderRejectionCategoriesKeyboard(),
      }
    );

    const catCtx = await conversation.wait();
    const catCallback = catCtx.callbackQuery?.data;
    const catText = catCtx.message?.text ?? '';

    if (catCallback === 'flow:cancel' || isCancelCommand(catText)) {
      if (catCtx.callbackQuery) {
        try {
          await catCtx.answerCallbackQuery();
        } catch {}
      }
      await catCtx.reply('❌ عملیات رد سفارش لغو شد.');
      return;
    }

    const catMatch = catCallback?.match(/^order_reject_cat:(.+)$/);
    if (!catMatch || !catMatch[1]) {
      await catCtx.reply('❌ عملیات رد سفارش لغو شد.');
      return;
    }

    const selectedCategoryCode = catMatch[1] as OrderRejectionCategoryCode;
    const categoryInfo =
      ORDER_REJECTION_CATEGORIES[selectedCategoryCode] ??
      ORDER_REJECTION_CATEGORIES.OTHER;

    if (catCtx.callbackQuery) {
      try {
        await catCtx.answerCallbackQuery();
      } catch {}
    }

    // Step 2: Note Prompt
    let rejectionNote: string | null = null;

    if (selectedCategoryCode === 'OTHER') {
      // Note is mandatory for OTHER
      await catCtx.reply(
        `✏️ *علت رد سفارش: سایر*\n\n` +
        `لطفاً دلیل یا توضیحات رد سفارش را تایپ و ارسال نمایید (اجباری):\n\n` +
        `(برای انصراف /cancel را ارسال نمایید)`,
        {
          parse_mode: 'Markdown',
          reply_markup: getOrderRejectionNotePromptKeyboard(false),
        }
      );

      const noteCtx = await conversation.wait();
      const noteCallback = noteCtx.callbackQuery?.data;
      const noteText = noteCtx.message?.text ?? '';

      if (noteCallback === 'flow:cancel' || isCancelCommand(noteText)) {
        if (noteCtx.callbackQuery) {
          try {
            await noteCtx.answerCallbackQuery();
          } catch {}
        }
        await noteCtx.reply('❌ عملیات رد سفارش لغو شد.');
        return;
      }

      if (!noteText.trim()) {
        await noteCtx.reply('❌ ثبت توضیحات برای این گزینه الزامی است. عملیات لغو شد.');
        return;
      }

      rejectionNote = noteText.trim();
    } else {
      // Note is optional for preset categories
      await catCtx.reply(
        `📋 *علت انتخاب شده:* ${categoryInfo.label}\n\n` +
        `آیا مایل به افزودن یادداشت/توضیحات اضافی برای خریدار هستید؟\n` +
        `اکنون متن را ارسال کنید یا دکمه «⏩ رد کردن (بدون یادداشت)» را بزنید:\n\n` +
        `(برای انصراف /cancel را ارسال نمایید)`,
        {
          parse_mode: 'Markdown',
          reply_markup: getOrderRejectionNotePromptKeyboard(true),
        }
      );

      const noteCtx = await conversation.wait();
      const noteCallback = noteCtx.callbackQuery?.data;
      const noteText = noteCtx.message?.text ?? '';

      if (noteCallback === 'flow:cancel' || isCancelCommand(noteText)) {
        if (noteCtx.callbackQuery) {
          try {
            await noteCtx.answerCallbackQuery();
          } catch {}
        }
        await noteCtx.reply('❌ عملیات رد سفارش لغو شد.');
        return;
      }

      if (
        noteCallback === 'order_reject_note:skip' ||
        noteText.toLowerCase() === 'skip' ||
        noteText === 'رد کردن'
      ) {
        if (noteCtx.callbackQuery) {
          try {
            await noteCtx.answerCallbackQuery();
          } catch {}
        }
        rejectionNote = null;
      } else if (noteText.trim()) {
        rejectionNote = noteText.trim();
      } else {
        rejectionNote = null;
      }
    }

    // Step 3: Execute Rejection Service
    try {
      await conversation.external(async () => {
        await orderService.rejectOrder(
          {
            orderId,
            adminTelegramId: sender.id,
            rejectionCategory: selectedCategoryCode,
            rejectionNote,
          },
          {
            notifyBuyer: async ({ buyer, refundAmount, updatedBalance, rejectionNote: note }) => {
              const buyerMessage =
                `❌ *سفارش شما رد شد*\n\n` +
                `📦 شناسه سفارش: #${shortOrderId}\n` +
                `📋 علت رد: ${categoryInfo.label} (${categoryInfo.labelEn})\n` +
                `${note ? `💬 توضیحات: ${note}\n` : ''}\n` +
                `💵 مبلغ برگشت داده شده به کیف پول: $${refundAmount}\n` +
                `💰 موجودی فعلی کیف پول شما: $${updatedBalance}\n\n` +
                `مبلغ سفارش به موجودی حساب شما برگشت داده شد.`;

              await ctx.api.sendMessage(
                buyer.telegramChatId.toString(),
                buyerMessage,
                { parse_mode: 'Markdown' }
              );
            },
            updateAdminNotifications: async ({ notifications }) => {
              const rejectedKeyboard =
                getAdminOrderRejectedKeyboard(adminDisplay);
              await editAdminOrderNotificationMessages(
                ctx.api,
                notifications,
                rejectedKeyboard
              );
            },

          }
        );
      });

      await ctx.reply(
        `✅ سفارش #${shortOrderId} با موفقیت رد شد و وجه به کیف پول خریدار بازگشت داده شد.`
      );
    } catch (err: any) {
      if (err instanceof InvalidOrderStatusError) {
        await ctx.reply('⚠️ این سفارش قبلاً تعیین تکلیف شده است یا در وضعیت قابل رد کردن نیست.');
        return;
      }
      if (err instanceof OrderNotFoundError) {
        await ctx.reply('⚠️ سفارش مورد نظر یافت نشد.');
        return;
      }
      if (err instanceof OrderRejectionNoteRequiredError) {
        await ctx.reply('⚠️ ثبت توضیحات برای گزینه سایر الزامی است.');
        return;
      }

      console.error('Failed to reject order in conversation:', err);
      await ctx.reply('❌ خطایی در ثبت رد سفارش رخ داد.');
    }
  };
}
