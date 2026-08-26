import type { Conversation, ConversationFlavor } from '@grammyjs/conversations';
import type { Context } from 'grammy';
import type { DbClient } from '../../db/client';
import {
  setActiveAccount,
  type SetActiveAccountInput,
} from '../../services/bank-account.service';

export type BotContext = ConversationFlavor<Context>;
export type SetCardConversation = Conversation<BotContext, Context>;

export const SETCARD_CONVERSATION_ID = 'setcard';

/**
 * Strips whitespace and hyphens from the card number string.
 */
export function cleanCardNumber(raw: string): string {
  return raw.trim().replace(/[\s-]/g, '');
}

/**
 * Returns true if the raw input is a valid 16-digit card number (ignoring spaces and hyphens).
 */
export function isValidCardNumber(raw: string): boolean {
  if (!raw) {
    return false;
  }
  const cleaned = cleanCardNumber(raw);
  return /^\d{16}$/.test(cleaned);
}

import { isCancelCommand } from '../../utils/telegram';

export { isCancelCommand };

/**
 * Checks if the message text represents skipping the optional notes (/skip, skip, -, or empty).
 */
export function isSkipCommand(raw: string): boolean {
  if (!raw) {
    return true;
  }
  const trimmed = raw.trim();
  return (
    trimmed === '' ||
    trimmed === '-' ||
    /^\/skip(@\w+)?$/i.test(trimmed) ||
    trimmed.toLowerCase() === 'skip'
  );
}

export function getCardNumberPromptMessage(): string {
  return 'Please enter the 16-digit card number (or send /cancel to abort):';
}

export function getCardNumberErrorMessage(): string {
  return 'Invalid card number. Please enter a valid 16-digit card number (or send /cancel to abort):';
}

export function getCardHolderNamePromptMessage(): string {
  return 'Please enter the card holder name (or send /cancel to abort):';
}

export function getCardHolderNameErrorMessage(): string {
  return 'Card holder name cannot be empty. Please enter the card holder name (or send /cancel to abort):';
}

export function getBankNamePromptMessage(): string {
  return 'Please enter the bank name (or send /cancel to abort):';
}

export function getBankNameErrorMessage(): string {
  return 'Bank name cannot be empty. Please enter the bank name (or send /cancel to abort):';
}

export function getAdditionalNotesPromptMessage(): string {
  return 'Please enter any additional transfer instructions/notes, or send /skip to leave empty (or send /cancel to abort):';
}

export function getSetCardCancelledMessage(): string {
  return 'Bank account setup cancelled.';
}

export type SetCardSummaryInput = SetActiveAccountInput;

export function getSetCardSuccessMessage(account: SetCardSummaryInput): string {
  const notes = account.additionalNotes?.trim() || 'None';
  return (
    `Bank Account updated and activated successfully!\n\n` +
    `Card Number: ${account.cardNumber}\n` +
    `Card Holder: ${account.cardHolderName}\n` +
    `Bank: ${account.bankName}\n` +
    `Notes: ${notes}`
  );
}

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
