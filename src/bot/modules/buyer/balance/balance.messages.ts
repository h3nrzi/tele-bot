import { formatUsd } from '../../../../utils/currency';

/**
 * Returns the message showing the Buyer's current Available Balance.
 */
export function getBalanceMessage(availableBalance: string): string {
  return `موجودی در دسترس شما ${formatUsd(availableBalance)} است.`;
}

/**
 * Returns the prompt message when an unregistered sender attempts to check balance.
 */
export function getUnregisteredBalanceMessage(): string {
  return 'لطفاً ابتدا با ارسال دستور /start کیف پول خود را ایجاد کنید.';
}
