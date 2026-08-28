import { formatUsd } from '@/core/shared/currency.utils';
import type { UsdAmount } from '@/core/shared/money.vo';
import type Decimal from 'decimal.js';

export function getBuyerBalanceMessage(
  availableBalance: string | Decimal | UsdAmount
): string {
  return `💰 موجودی کیف پول شما: ${formatUsd(availableBalance)}`;
}

export const getBalanceMessage = getBuyerBalanceMessage;

export function getUnregisteredBalanceMessage(): string {
  return 'شما هنوز در ربات ثبت نام نکرده‌اید. لطفاً با ارسال /start ثبت نام خود را انجام دهید.';
}
