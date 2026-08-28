import type { Context } from 'grammy';
import type { BotConversation } from '@/bot/context';
import type { BankAccountService } from '@/modules/bank-account/bank-account.service';
import { isCancelCommand } from '@/core/shared/telegram.utils';
import {
  getSetCardPromptCardNumberMessage,
  getSetCardInvalidCardNumberMessage,
  getSetCardPromptHolderNameMessage,
  getSetCardPromptBankNameMessage,
  getSetCardPromptNotesMessage,
  getSetCardCancelledMessage,
  getSetCardSuccessMessage,
  isSkipCommand,
} from '@/bot/handlers/admin/bank-account.messages';

export type SetCardConversation = BotConversation;
export const SETCARD_CONVERSATION_ID = 'setcard';

/**
 * Validates 16-digit card number (digits only, length exactly 16).
 */
export function isValidCardNumber(cardNumber: string): boolean {
  const digitsOnly = cardNumber.replace(/[\s-]/g, '');
  return /^\d{16}$/.test(digitsOnly);
}

/**
 * Creates the grammY conversation for Admin bank account / card setup flow.
 */
export function createSetCardConversation(bankAccountService: BankAccountService) {
  return async function setCard(
    conversation: SetCardConversation,
    ctx: Context
  ): Promise<void> {
    // Step 1: Prompt Card Number
    await ctx.reply(getSetCardPromptCardNumberMessage());

    let cardNumber = '';
    while (true) {
      const nextCtx = await conversation.wait();
      const text = nextCtx.message?.text ?? '';

      if (isCancelCommand(text)) {
        await nextCtx.reply(getSetCardCancelledMessage());
        return;
      }

      const cleaned = text.replace(/[\s-]/g, '');
      if (isValidCardNumber(cleaned)) {
        cardNumber = cleaned;
        break;
      }

      await nextCtx.reply(getSetCardInvalidCardNumberMessage());
    }

    // Step 2: Prompt Card Holder Name
    await ctx.reply(getSetCardPromptHolderNameMessage());
    let cardHolderName = '';
    while (true) {
      const nextCtx = await conversation.wait();
      const text = nextCtx.message?.text ?? '';

      if (isCancelCommand(text)) {
        await nextCtx.reply(getSetCardCancelledMessage());
        return;
      }

      if (text.trim().length > 0) {
        cardHolderName = text.trim();
        break;
      }

      await nextCtx.reply(getSetCardPromptHolderNameMessage());
    }

    // Step 3: Prompt Bank Name
    await ctx.reply(getSetCardPromptBankNameMessage());
    let bankName = '';
    while (true) {
      const nextCtx = await conversation.wait();
      const text = nextCtx.message?.text ?? '';

      if (isCancelCommand(text)) {
        await nextCtx.reply(getSetCardCancelledMessage());
        return;
      }

      if (text.trim().length > 0) {
        bankName = text.trim();
        break;
      }

      await nextCtx.reply(getSetCardPromptBankNameMessage());
    }

    // Step 4: Prompt Optional Notes
    await ctx.reply(getSetCardPromptNotesMessage());
    const notesCtx = await conversation.wait();
    const notesText = notesCtx.message?.text ?? '';

    if (isCancelCommand(notesText)) {
      await notesCtx.reply(getSetCardCancelledMessage());
      return;
    }

    const additionalNotes = isSkipCommand(notesText) ? null : notesText.trim();

    // Step 5: Save Bank Account
    const updatedAccount = await conversation.external(async () => {
      return await bankAccountService.setActiveAccount({
        cardNumber,
        cardHolderName,
        bankName,
        additionalNotes,
      });
    });

    await ctx.reply(getSetCardSuccessMessage(updatedAccount));
  };
}
