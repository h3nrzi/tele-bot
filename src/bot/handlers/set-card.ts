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
  return 'لطفاً شماره کارت ۱۶ رقمی را وارد کنید (یا /cancel را برای انصراف ارسال کنید):';
}

export function getCardNumberErrorMessage(): string {
  return 'شماره کارت نامعتبر است. لطفاً یک شماره کارت معتبر ۱۶ رقمی وارد کنید (یا /cancel را برای انصراف ارسال کنید):';
}

export function getCardHolderNamePromptMessage(): string {
  return 'لطفاً نام صاحب حساب را وارد کنید (یا /cancel را برای انصراف ارسال کنید):';
}

export function getCardHolderNameErrorMessage(): string {
  return 'نام صاحب حساب نمی‌تواند خالی باشد. لطفاً نام صاحب حساب را وارد کنید (یا /cancel را برای انصراف ارسال کنید):';
}

export function getBankNamePromptMessage(): string {
  return 'لطفاً نام بانک را وارد کنید (یا /cancel را برای انصراف ارسال کنید):';
}

export function getBankNameErrorMessage(): string {
  return 'نام بانک نمی‌تواند خالی باشد. لطفاً نام بانک را وارد کنید (یا /cancel را برای انصراف ارسال کنید):';
}

export function getAdditionalNotesPromptMessage(): string {
  return 'لطفاً توضیحات یا نکات اضافی انتقال را وارد کنید، یا برای رد شدن /skip را ارسال کنید (یا /cancel برای انصراف):';
}

export function getSetCardCancelledMessage(): string {
  return 'تنظیم اطلاعات حساب بانکی لغو شد.';
}

export type SetCardSummaryInput = SetActiveAccountInput;

export function getSetCardSuccessMessage(account: SetCardSummaryInput): string {
  const notes = account.additionalNotes?.trim() || 'ندارد';
  return (
    `اطلاعات حساب بانکی با موفقیت به‌روزرسانی و فعال شد!\n\n` +
    `شماره کارت: ${account.cardNumber}\n` +
    `صاحب حساب: ${account.cardHolderName}\n` +
    `بانک: ${account.bankName}\n` +
    `توضیحات: ${notes}`
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
