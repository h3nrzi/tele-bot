import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import type { DbClient } from '../../db/client';
import { approveTopUp } from '../../application/top-up/top-up.service';
import { TopUpRequestNotPendingError } from '../../domain/top-up/top-up.errors';
import { formatUsd } from '../../utils/currency';
import type Decimal from 'decimal.js';

export function formatBuyerApprovalMessage(params: {
  usdAmount: string | Decimal;
  availableBalance: string | Decimal;
}): string {
  return (
    `✅ درخواست افزایش موجودی شما تایید شد!\n\n` +
    `مبلغ شارژ شده: ${formatUsd(params.usdAmount)}\n` +
    `موجودی جدید کیف پول: ${formatUsd(params.availableBalance)}`
  );
}

export function formatAdminApprovalOutcome(
  originalCaptionOrText: string,
  adminDisplay: string | number | bigint
): string {
  return `${originalCaptionOrText}\n\n✅ تایید شد توسط: ${adminDisplay}`;
}

export function formatAdminAlreadyProcessedOutcome(
  originalCaptionOrText: string
): string {
  return `${originalCaptionOrText}\n\n⚠️ این درخواست قبلاً تعیین تکلیف شده است.`;
}

export interface ApproveHandlerOptions {
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
 * Handles inline Approve button callback queries from Admins:
 * 1. Validates callback query data pattern (approve:<requestId>).
 * 2. Invokes approveTopUp service inside atomic transaction.
 * 3. Sends push notification to Buyer with credited amount and new Available Balance.
 * 4. Edits the original Admin message to show the approval outcome and removes inline buttons.
 * 5. Handles already-processed requests gracefully on concurrent taps.
 */
export async function handleApproveCallback(
  ctx: Context,
  dbClient?: DbClient,
  _options?: ApproveHandlerOptions
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

  try {
    await approveTopUp(
      {
        topUpRequestId,
        adminTelegramId: sender.id,
      },
      dbClient,
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
