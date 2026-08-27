import type { Context } from 'grammy';
import type { DbClient } from '@/db/client';
import type { BotConversation } from '@/bot/core/context';
import { setActiveAccount } from '@/application/bank-account/bank-account.service';
import {
  cleanCardNumber,
  isValidCardNumber,
  isCancelCommand,
  isSkipCommand,
  getCardNumberPromptMessage,
  getCardNumberErrorMessage,
  getCardHolderNamePromptMessage,
  getCardHolderNameErrorMessage,
  getBankNamePromptMessage,
  getBankNameErrorMessage,
  getAdditionalNotesPromptMessage,
  getSetCardCancelledMessage,
  getSetCardSuccessMessage,
} from '@/bot/modules/admin/bank-account/set-card.messages';

export type SetCardConversation = BotConversation;
export const SETCARD_CONVERSATION_ID = 'setcard';

/**
 * Creates the conversation builder function for the /setcard Admin command.
 */
export function createSetCardConversation(dbClient?: DbClient) {
  return async function setcard(
    conversation: SetCardConversation,
    ctx: Context
  ): Promise<void> {
    // 1. Card Number Step
    await ctx.reply(getCardNumberPromptMessage());
    let cardNumber = '';
    while (true) {
      const nextCtx = await conversation.wait();
      const text = nextCtx.message?.text ?? '';
      if (isCancelCommand(text)) {
        await nextCtx.reply(getSetCardCancelledMessage());
        return;
      }
      if (isValidCardNumber(text)) {
        cardNumber = cleanCardNumber(text);
        break;
      }
      await nextCtx.reply(getCardNumberErrorMessage());
    }

    // 2. Card Holder Name Step
    await ctx.reply(getCardHolderNamePromptMessage());
    let cardHolderName = '';
    while (true) {
      const nextCtx = await conversation.wait();
      const text = nextCtx.message?.text ?? '';
      if (isCancelCommand(text)) {
        await nextCtx.reply(getSetCardCancelledMessage());
        return;
      }
      const trimmed = text.trim();
      if (trimmed.length > 0) {
        cardHolderName = trimmed;
        break;
      }
      await nextCtx.reply(getCardHolderNameErrorMessage());
    }

    // 3. Bank Name Step
    await ctx.reply(getBankNamePromptMessage());
    let bankName = '';
    while (true) {
      const nextCtx = await conversation.wait();
      const text = nextCtx.message?.text ?? '';
      if (isCancelCommand(text)) {
        await nextCtx.reply(getSetCardCancelledMessage());
        return;
      }
      const trimmed = text.trim();
      if (trimmed.length > 0) {
        bankName = trimmed;
        break;
      }
      await nextCtx.reply(getBankNameErrorMessage());
    }

    // 4. Additional Notes Step (Optional)
    await ctx.reply(getAdditionalNotesPromptMessage());
    let additionalNotes: string | null = null;
    while (true) {
      const nextCtx = await conversation.wait();
      const text = nextCtx.message?.text ?? '';
      if (isCancelCommand(text)) {
        await nextCtx.reply(getSetCardCancelledMessage());
        return;
      }
      if (isSkipCommand(text)) {
        additionalNotes = null;
        break;
      }
      additionalNotes = text.trim();
      break;
    }

    // 5. Commit Active Bank Account
    const savedAccount = await conversation.external(async () => {
      const acc = await setActiveAccount(
        {
          cardNumber,
          cardHolderName,
          bankName,
          additionalNotes,
        },
        dbClient
      );
      return {
        cardNumber: acc.cardNumber,
        cardHolderName: acc.cardHolderName,
        bankName: acc.bankName,
        additionalNotes: acc.additionalNotes,
      };
    });

    // 6. Confirmation Summary
    await ctx.reply(getSetCardSuccessMessage(savedAccount));
  };
}
