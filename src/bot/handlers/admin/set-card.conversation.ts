import type { Context } from 'grammy';
import type { BotConversation } from '@/bot/context';
import type { BankAccountService } from '@/modules/bank-account/bank-account.service';
import { isCancelCommand } from '@/core/shared/telegram.utils';

export type SetCardConversation = BotConversation;
export const SETCARD_CONVERSATION_ID = 'setcard';

/**
 * Cleans a card number string by removing whitespace and hyphens.
 */
export function cleanCardNumber(cardNumber: string): string {
  return cardNumber.replace(/[\s-]/g, '');
}

/**
 * Checks if input is a skip command for optional fields.
 */
export function isSkipCommand(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  return (
    trimmed === '-' ||
    trimmed === 'skip' ||
    trimmed.startsWith('/skip') ||
    trimmed === ''
  );
}

/**
 * Validates 16-digit card number (digits only, length exactly 16).
 */
export function isValidCardNumber(cardNumber: string): boolean {
  const digitsOnly = cleanCardNumber(cardNumber);
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
    await ctx.reply('لطفاً شماره کارت ۱۶ رقمی را وارد کنید (یا برای انصراف /cancel را ارسال کنید):');

    let cardNumber = '';
    while (true) {
      const nextCtx = await conversation.wait();
      const text = nextCtx.message?.text ?? '';

      if (isCancelCommand(text)) {
        await nextCtx.reply('عملیات تنظیم کارت بانکی لغو شد.');
        return;
      }

      const cleaned = cleanCardNumber(text);
      if (isValidCardNumber(cleaned)) {
        cardNumber = cleaned;
        break;
      }

      await nextCtx.reply(
        '❌ شماره کارت نامعتبر است. شماره کارت باید دقیقاً ۱۶ رقم باشد. لطفاً مجدداً وارد کنید (یا برای انصراف /cancel را ارسال کنید):'
      );
    }

    // Step 2: Prompt Card Holder Name
    await ctx.reply('لطفاً نام صاحب حساب / دارنده کارت را وارد کنید:');
    let cardHolderName = '';
    while (true) {
      const nextCtx = await conversation.wait();
      const text = nextCtx.message?.text ?? '';

      if (isCancelCommand(text)) {
        await nextCtx.reply('عملیات تنظیم کارت بانکی لغو شد.');
        return;
      }

      if (text.trim().length > 0) {
        cardHolderName = text.trim();
        break;
      }

      await nextCtx.reply('لطفاً نام صاحب حساب / دارنده کارت را وارد کنید:');
    }

    // Step 3: Prompt Bank Name
    await ctx.reply('لطفاً نام بانک را وارد کنید:');
    let bankName = '';
    while (true) {
      const nextCtx = await conversation.wait();
      const text = nextCtx.message?.text ?? '';

      if (isCancelCommand(text)) {
        await nextCtx.reply('عملیات تنظیم کارت بانکی لغو شد.');
        return;
      }

      if (text.trim().length > 0) {
        bankName = text.trim();
        break;
      }

      await nextCtx.reply('لطفاً نام بانک را وارد کنید:');
    }

    // Step 4: Prompt Optional Notes
    await ctx.reply('توضیحات تکمیلی (اختیاری) را وارد کنید یا در صورت عدم نیاز عبارت - یا skip را ارسال کنید:');
    const notesCtx = await conversation.wait();
    const notesText = notesCtx.message?.text ?? '';

    if (isCancelCommand(notesText)) {
      await notesCtx.reply('عملیات تنظیم کارت بانکی لغو شد.');
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

    const notesLine = updatedAccount.additionalNotes
      ? `\nتوضیحات: ${updatedAccount.additionalNotes}`
      : `\nتوضیحات: ندارد`;

    await ctx.reply(
      `✅ حساب بانکی فعال با موفقیت به‌روزرسانی شد!\n\n` +
      `شماره کارت: ${updatedAccount.cardNumber}\n` +
      `صاحب حساب: ${updatedAccount.cardHolderName}\n` +
      `بانک: ${updatedAccount.bankName}` +
      notesLine
    );
  };
}
