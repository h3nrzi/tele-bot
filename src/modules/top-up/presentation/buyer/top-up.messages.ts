import { formatUsd, formatIrr } from '@/core/shared/currency.utils';
import type { BankAccount } from '@/modules/bank-account/bank-account.entity';
import type { UsdAmount } from '@/core/shared/money.vo';
import type Decimal from 'decimal.js';

export function getTopUpPromptMessage(
  minUsd: Decimal | string | UsdAmount,
  maxUsd: Decimal | string | UsdAmount
): string {
  return `لطفاً مبلغ مورد نظر برای افزایش موجودی به دلار را وارد کنید (حداقل: ${formatUsd(minUsd)}، حداکثر: ${formatUsd(maxUsd)})، یا برای انصراف /cancel را ارسال کنید:`;
}

export function getTopUpUnavailableMessage(): string {
  return 'افزایش موجودی موقتاً در دسترس نیست. لطفاً بعداً تلاش کنید.';
}

export function getTopUpActiveExistsMessage(): string {
  return 'شما یک درخواست افزایش موجودی فعال دارید. لطفاً قبل از ثبت درخواست جدید، درخواست قبلی را تکمیل یا لغو کنید.';
}

export function getTopUpCancelledMessage(): string {
  return 'درخواست افزایش موجودی لغو شد.';
}

export function getAdminNoRateAlertMessage(): string {
  return '⚠️ فوری: کاربری قصد افزایش موجودی داشت اما هیچ نرخ ارزی تنظیم نشده است! لطفاً هرچه سریع‌تر با دستور /setrate نرخ ارز را مشخص کنید.';
}

export function getTopUpSuccessMessage(details: {
  usdAmount: string;
  irrAmount: bigint;
  bankAccount: BankAccount;
  expiresAt: Date;
}): string {
  const notesLine = details.bankAccount.additionalNotes
    ? `توضیحات: ${details.bankAccount.additionalNotes}\n`
    : '';

  return (
    `درخواست افزایش موجودی ثبت شد!\n\n` +
    `مبلغ: ${formatUsd(details.usdAmount)}\n` +
    `مبلغ پرداختی به ریال: ${formatIrr(details.irrAmount)} ریال\n\n` +
    `مشخصات حساب بانکی:\n` +
    `شماره کارت: ${details.bankAccount.cardNumber}\n` +
    `صاحب حساب: ${details.bankAccount.cardHolderName}\n` +
    `بانک: ${details.bankAccount.bankName}\n` +
    notesLine +
    `\nلطفاً مبلغ دقیق ریالی را به حساب بانکی فوق واریز نمایید. پس از واریز، عکس رسید پرداخت خود را ارسال کنید.`
  );
}
