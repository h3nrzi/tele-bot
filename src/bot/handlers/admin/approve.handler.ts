import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import type { TopUpService } from '@/modules/top-up/top-up.service';
import { TopUpRequestNotPendingError } from '@/modules/top-up/top-up.errors';
import {
  formatBuyerApprovalMessage,
  formatAdminApprovalOutcome,
  formatAdminAlreadyProcessedOutcome,
} from '@/bot/handlers/admin/approval.messages';

export interface ApproveHandlerDependencies {
  topUpService: TopUpService;
  adminIds?: string | Set<bigint> | undefined;
}

async function editAdminMessageOutcome(
  ctx: Context,
  outcomeText: string
): Promise<void> {
  const message = ctx.callbackQuery?.message;
  try {
    if (message && 'photo' in message) {
      await ctx.editMessageCaption({
        caption: outcomeText,
        reply_markup: new InlineKeyboard(),
      });
    } else {
      await ctx.editMessageText(outcomeText, {
        reply_markup: new InlineKeyboard(),
      });
    }
  } catch (editErr) {
    console.error('Failed to edit admin notification message:', editErr);
  }
}

/**
 * Handles inline Approve button callback queries from Admins.
 */
export async function handleApproveCallback(
  ctx: Context,
  deps: ApproveHandlerDependencies
): Promise<void> {
  const sender = ctx.from;
  if (!sender) {
    return;
  }

  const callbackData = ctx.callbackQuery?.data;
  if (!callbackData) {
    return;
  }

  const match = callbackData.match(/^approve:(.+)$/);
  if (!match || !match[1]) {
    return;
  }

  const topUpRequestId = match[1];
  const adminDisplay = sender.username
    ? `@${sender.username}`
    : sender.first_name || String(sender.id);

  const message = ctx.callbackQuery?.message;
  const originalCaption =
    message && 'caption' in message
      ? message.caption ?? ''
      : message && 'text' in message
        ? message.text ?? ''
        : '';

  const { topUpService } = deps;

  try {
    await topUpService.approveTopUp(
      {
        topUpRequestId,
        adminTelegramId: sender.id,
      },
      {
        notifyBuyer: async (params) => {
          const messageText = formatBuyerApprovalMessage({
            usdAmount: params.creditedUsdAmount,
            availableBalance: params.newAvailableBalance,
          });
          await ctx.api.sendMessage(
            params.buyerTelegramChatId.toString(),
            messageText
          );
        },
      }
    );

    // Edit admin notification message to show approved outcome
    const newCaption = formatAdminApprovalOutcome(originalCaption, adminDisplay);
    await editAdminMessageOutcome(ctx, newCaption);

    // Answer callback query
    await ctx.answerCallbackQuery({
      text: '✅ درخواست با موفقیت تایید شد.',
    });
  } catch (err: any) {
    if (err instanceof TopUpRequestNotPendingError) {
      const alreadyProcessedCaption =
        formatAdminAlreadyProcessedOutcome(originalCaption);
      await editAdminMessageOutcome(ctx, alreadyProcessedCaption);

      await ctx.answerCallbackQuery({
        text: '⚠️ این درخواست قبلاً تعیین تکلیف شده است.',
        show_alert: true,
      });
      return;
    }

    console.error('Unexpected error in handleApproveCallback:', err);
    await ctx.answerCallbackQuery({
      text: '❌ خطایی در پردازش درخواست رخ داد.',
      show_alert: true,
    });
  }
}
