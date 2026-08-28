import { formatIrr } from '@/core/shared/currency.utils';
import type { IrrAmount } from '@/core/shared/money.vo';
import type Decimal from 'decimal.js';

export function getRateCurrentMessage(rate: {
  irrPerUsd: bigint | number | string | Decimal | IrrAmount;
  updatedAt?: Date | undefined;
  createdAt?: Date | undefined;
}): string {
  const date = rate.updatedAt ?? rate.createdAt ?? new Date();
  const dateFormatted = date.toISOString();
  return (
    `💱 نرخ فعلی تبدیل ارز:\n\n` +
    `هر ۱ دلار آمریکا = ${formatIrr(rate.irrPerUsd)} ریال\n` +
    `آخرین به‌روزرسانی: ${dateFormatted}`
  );
}

export const getCurrentRateMessage = getRateCurrentMessage;

export function getRateNotSetMessage(): string {
  return '⚠️ در حال حاضر هیچ نرخ ارزی در سیستم تنظیم نشده است. لطفاً با دستور /setrate نرخ ارز را تنظیم کنید.';
}

export const getNoRateConfiguredMessage = getRateNotSetMessage;

export function getSetRatePromptGuideMessage(): string {
  return (
    `برای تنظیم نرخ ارز، لطفاً مقدار ریالی هر دلار را به همراه دستور /setrate ارسال کنید.\n` +
    `مثال: /setrate 620000`
  );
}

export function getSetRateSuccessMessage(irrPerUsd: bigint | number | string): string {
  return `✅ نرخ جدید با موفقیت تنظیم شد:\nهر ۱ دلار آمریکا = ${formatIrr(irrPerUsd)} ریال`;
}

export function getSetRateInvalidFormatMessage(): string {
  return (
    `❌ فرمت نرخ وارد شده نامعتبر است.\n` +
    `لطفاً یک عدد صحیح مثبت به ریال وارد کنید.\n` +
    `مثال: /setrate 620000`
  );
}

export const getSetRateUsageErrorMessage = getSetRateInvalidFormatMessage;

export function getSetRateNonPositiveMessage(): string {
  return '❌ نرخ ارز باید یک مقدار عددی مثبت (بزرگتر از صفر) باشد.';
}
