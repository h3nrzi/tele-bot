import type { SetActiveAccountInput } from '@/application/bank-account/dtos/set-active-account.dto';
import { isCancelCommand } from '@/utils/telegram';

export { isCancelCommand };

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
