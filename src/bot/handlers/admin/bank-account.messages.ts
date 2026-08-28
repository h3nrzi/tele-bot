export function cleanCardNumber(cardNumber: string): string {
  return cardNumber.replace(/[\s-]/g, '');
}

export function isSkipCommand(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  return (
    trimmed === '-' ||
    trimmed === 'skip' ||
    trimmed.startsWith('/skip') ||
    trimmed === ''
  );
}

export function getSetCardPromptCardNumberMessage(): string {
  return 'لطفاً شماره کارت ۱۶ رقمی را وارد کنید (یا برای انصراف /cancel را ارسال کنید):';
}

export const getCardNumberPromptMessage = getSetCardPromptCardNumberMessage;

export function getSetCardInvalidCardNumberMessage(): string {
  return '❌ شماره کارت نامعتبر است. شماره کارت باید دقیقاً ۱۶ رقم باشد. لطفاً مجدداً وارد کنید (یا برای انصراف /cancel را ارسال کنید):';
}

export const getCardNumberErrorMessage = getSetCardInvalidCardNumberMessage;

export function getSetCardPromptHolderNameMessage(): string {
  return 'لطفاً نام صاحب حساب / دارنده کارت را وارد کنید:';
}

export const getCardHolderNamePromptMessage = getSetCardPromptHolderNameMessage;
export const getCardHolderNameErrorMessage = getSetCardPromptHolderNameMessage;

export function getSetCardPromptBankNameMessage(): string {
  return 'لطفاً نام بانک را وارد کنید:';
}

export const getBankNamePromptMessage = getSetCardPromptBankNameMessage;
export const getBankNameErrorMessage = getSetCardPromptBankNameMessage;

export function getSetCardPromptNotesMessage(): string {
  return 'توضیحات تکمیلی (اختیاری) را وارد کنید یا در صورت عدم نیاز عبارت - یا skip را ارسال کنید:';
}

export const getAdditionalNotesPromptMessage = getSetCardPromptNotesMessage;

export function getSetCardCancelledMessage(): string {
  return 'عملیات تنظیم کارت بانکی لغو شد.';
}

export function getSetCardSuccessMessage(account: {
  cardNumber: string;
  cardHolderName: string;
  bankName: string;
  additionalNotes?: string | null;
}): string {
  const notesLine = account.additionalNotes
    ? `\nتوضیحات: ${account.additionalNotes}`
    : `\nتوضیحات: ندارد`;

  return (
    `✅ حساب بانکی فعال با موفقیت به‌روزرسانی شد!\n\n` +
    `شماره کارت: ${account.cardNumber}\n` +
    `صاحب حساب: ${account.cardHolderName}\n` +
    `بانک: ${account.bankName}` +
    notesLine
  );
}
