import { formatUsd, formatIrr } from '@/core/shared/currency.utils';
import type { TopUpStatus } from '@/modules/top-up/top-up-request.entity';
import type { UsdAmount, IrrAmount } from '@/core/shared/money.vo';
import type Decimal from 'decimal.js';

/**
 * Message returned when buyer has no top-up history.
 */
export function getNoTopUpHistoryMessage(): string {
  return 'شما تاکنون هیچ درخواست افزایش موجودی ثبت نکرده‌اید.';
}

/**
 * Returns user-facing label for each TopUpStatus.
 */
export function getStatusLabel(status: TopUpStatus): string {
  switch (status) {
    case 'INITIATED':
      return 'در انتظار پرداخت (INITIATED)';
    case 'PENDING':
      return 'در انتظار بررسی ادمین (PENDING)';
    case 'APPROVED':
      return 'تایید شده (APPROVED)';
    case 'REJECTED':
      return 'رد شده (REJECTED)';
    case 'EXPIRED':
      return 'منقضی شده (EXPIRED)';
    case 'CANCELLED':
      return 'لغو شده (CANCELLED)';
  }
}

/**
 * Formats a status message displaying the Buyer's most recent top-up request details.
 */
export function formatStatusMessage(params: {
  status: TopUpStatus;
  usdAmount: string | Decimal | UsdAmount;
  irrAmount: bigint | number | string | Decimal | IrrAmount;
  createdAt: Date;
  rejectionReason?: string | null;
}): string {
  const statusLabel = getStatusLabel(params.status);
  const dateFormatted = params.createdAt.toISOString();

  let message =
    `📊 وضعیت آخرین درخواست افزایش موجودی:\n\n` +
    `وضعیت: ${statusLabel}\n` +
    `مبلغ: ${formatUsd(params.usdAmount)}\n` +
    `مبلغ ریالی: ${formatIrr(params.irrAmount)} ریال\n` +
    `تاریخ ثبت: ${dateFormatted}`;

  if (params.status === 'REJECTED' && params.rejectionReason) {
    message += `\nعلت رد درخواست: ${params.rejectionReason}`;
  }

  return message;
}
