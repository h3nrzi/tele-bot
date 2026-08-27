import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import type { DbClient } from '../../../../db/client';
import type { BotContext, BotConversation } from '../../../core/context';
import { rejectTopUp } from '../../../../application/top-up/top-up.service';
import { TopUpRequestNotPendingError } from '../../../../domain/top-up/top-up.errors';
import { isCancelCommand } from '../../../../utils/telegram';
import {
  formatAdminRejectionOutcome,
  formatBuyerRejectionMessage,
  getRejectionReasonPromptMessage,
  getCustomRejectionReasonPromptMessage,
  getRejectionCancelledMessage,
  getRejectionSuccessAdminMessage,
} from './rejection.messages';
import {
  PRESET_REJECTION_REASONS,
  getRejectionPresetsKeyboard,
} from './rejection.keyboards';
import { formatAdminAlreadyProcessedOutcome } from '../top-up-approval/approval.messages';

export type RejectConversation = BotConversation;
export const REJECT_CONVERSATION_ID = 'reject_topup';

async function editAdminNotificationMessage(
  api: Context['api'],
  chatId: number | string,
  messageId: number | undefined,
  isPhoto: boolean,
  outcomeCaptionOrText: string
): Promise<void> {
  if (!messageId) {
    return;
  }
  try {
    if (isPhoto) {
      await api.editMessageCaption(chatId, messageId, {
        caption: outcomeCaptionOrText,
        reply_markup: new InlineKeyboard(),
      });
    } else {
      await api.editMessageText(chatId, messageId, outcomeCaptionOrText, {
        reply_markup: new InlineKeyboard(),
      });
    }
  } catch (editErr) {
    console.error('Failed to edit admin notification message:', editErr);
  }
}

/**
 * Creates the grammY conversation for Admin top-up rejection flow:
 * 1. Presents preset rejection reason buttons + Custom option + Cancel button.
 * 2. If Admin selects a preset reason, rejects with that preset category.
 * 3. If Admin selects Custom, prompts for free-text note and rejects with that note verbatim.
 * 4. Updates top_up_request in DB to REJECTED, dispatches Buyer push notification post-commit.
 * 5. Edits the original Admin notification message to reflect outcome and removes inline buttons.
 * 6. Handles cancellation and multi-Admin race conditions gracefully.
 */
export function createRejectConversation(dbClient?: DbClient) {
  return async function rejectTopUpConversation(
    conversation: RejectConversation,
    ctx: Context
  ): Promise<void> {
    const sender = ctx.from;
    if (!sender) {
      return;
    }

    const callbackData = ctx.callbackQuery?.data;
    const match = callbackData?.match(/^reject:(.+)$/);
    if (!match || !match[1]) {
      return;
    }

    const requestId = match[1];
    const adminDisplay = sender.username
      ? `@${sender.username}`
      : sender.first_name || String(sender.id);

    const originalMessage = ctx.callbackQuery?.message;
    const originalMessageId = originalMessage?.message_id;
    const originalChatId = originalMessage?.chat?.id ?? sender.id;
    const originalCaption =
      (originalMessage && 'caption' in originalMessage
        ? originalMessage.caption
        : originalMessage && 'text' in originalMessage
          ? originalMessage.text
          : '') ?? '';
    const isPhoto = originalMessage ? 'photo' in originalMessage : true;

    try {
      await ctx.answerCallbackQuery();
    } catch {
      // Ignored if expired or already answered
    }

    // 1. Present preset reasons inline keyboard
    await ctx.reply(getRejectionReasonPromptMessage(), {
      reply_markup: getRejectionPresetsKeyboard(),
    });

    // 2. Wait for admin decision
    const nextCtx = await conversation.wait();
    const actionData = nextCtx.callbackQuery?.data;
    const actionText = nextCtx.message?.text ?? '';

    // Check cancellation
    if (
      actionData === 'reject_reason:cancel' ||
      isCancelCommand(actionText)
    ) {
      if (nextCtx.callbackQuery) {
        try {
          await nextCtx.answerCallbackQuery();
        } catch {}
      }
      await nextCtx.reply(getRejectionCancelledMessage());
      return;
    }

    let rejectionReason = '';

    if (actionData === 'reject_reason:custom') {
      if (nextCtx.callbackQuery) {
        try {
          await nextCtx.answerCallbackQuery();
        } catch {}
      }

      await nextCtx.reply(getCustomRejectionReasonPromptMessage());

      const customNoteCtx = await conversation.wait();
      const customText = customNoteCtx.message?.text ?? '';

      if (isCancelCommand(customText) || !customText.trim()) {
        await customNoteCtx.reply(getRejectionCancelledMessage());
        return;
      }

      rejectionReason = customText.trim();
    } else if (actionData && actionData.startsWith('reject_reason:')) {
      const presetKey = actionData.replace('reject_reason:', '');
      if (nextCtx.callbackQuery) {
        try {
          await nextCtx.answerCallbackQuery();
        } catch {}
      }
      rejectionReason = PRESET_REJECTION_REASONS[presetKey] ?? 'Rejected by Admin';
    } else if (actionText.trim()) {
      rejectionReason = actionText.trim();
    } else {
      await nextCtx.reply(getRejectionCancelledMessage());
      return;
    }

    // 3. Execute rejection service
    try {
      await conversation.external(async () => {
        await rejectTopUp(
          {
            topUpRequestId: requestId,
            adminTelegramId: sender.id,
            rejectionReason,
          },
          dbClient,
          {
            notifyBuyer: async (params) => {
              const buyerMessage = formatBuyerRejectionMessage({
                rejectionReason: params.rejectionReason,
              });
              await ctx.api.sendMessage(
                params.buyerTelegramChatId.toString(),
                buyerMessage
              );
            },
          }
        );
      });

      // 4. Edit original Admin notification message
      const newCaption = formatAdminRejectionOutcome(
        originalCaption,
        adminDisplay,
        rejectionReason
      );
      await editAdminNotificationMessage(
        ctx.api,
        originalChatId,
        originalMessageId,
        isPhoto,
        newCaption
      );

      await nextCtx.reply(getRejectionSuccessAdminMessage(rejectionReason));
    } catch (err: any) {
      if (
        err instanceof TopUpRequestNotPendingError ||
        err?.code === 'TOP_UP_REQUEST_NOT_PENDING' ||
        err?.name === 'TopUpRequestNotPendingError' ||
        err?.message?.includes('not pending approval')
      ) {
        const alreadyProcessedCaption =
          formatAdminAlreadyProcessedOutcome(originalCaption);
        await editAdminNotificationMessage(
          ctx.api,
          originalChatId,
          originalMessageId,
          isPhoto,
          alreadyProcessedCaption
        );

        await nextCtx.reply('⚠️ این درخواست قبلاً تعیین تکلیف شده است.');
        return;
      }

      console.error('Unexpected error in rejectTopUp conversation:', err);
      await nextCtx.reply('❌ خطایی در پردازش رد درخواست رخ داد.');
    }
  };
}
