import { formatUsd, formatIrr } from '@/utils/currency';
import type { UsdAmount, IrrAmount } from '@/domain/shared/money.vo';
import type Decimal from 'decimal.js';

export function formatAdminReceiptNotification(params: {
  buyerUsername?: string | null;
  buyerChatId: bigint | number;
  usdAmount: string | Decimal | UsdAmount;
  irrAmount: bigint | number | string | Decimal | IrrAmount;
  caption?: string | null;
}): string {
  const buyerDisplay = params.buyerUsername
    ? `@${params.buyerUsername} (شناسه: ${params.buyerChatId})`
    : `شناسه: ${params.buyerChatId}`;

  const captionLine = params.caption
    ? `\n\nتوضیحات خریدار:\n${params.caption}`
    : '';

  return (
    `📥 رسید پرداخت جدید دریافت شد\n\n` +
    `خریدار: ${buyerDisplay}\n` +
    `مبلغ درخواستی: ${formatUsd(params.usdAmount)}\n` +
    `مبلغ ریالی: ${formatIrr(params.irrAmount)} ریال` +
    captionLine
  );
}

export function formatBuyerApprovalMessage(params: {
  usdAmount: string | Decimal;
  availableBalance: string | Decimal;
}): string {
  return (
    `✅ درخواست افزایش موجودی شما تایید شد!\n\n` +
    `مبلغ شارژ شده: ${formatUsd(params.usdAmount)}\n` +
    `موجودی جدید کیف پول: ${formatUsd(params.availableBalance)}`
  );
}

export function formatAdminApprovalOutcome(
  originalCaptionOrText: string,
  adminDisplay: string | number | bigint
): string {
  return `${originalCaptionOrText}\n\n✅ تایید شد توسط: ${adminDisplay}`;
}

export function formatAdminAlreadyProcessedOutcome(
  originalCaptionOrText: string
): string {
  return `${originalCaptionOrText}\n\n⚠️ این درخواست قبلاً تعیین تکلیف شده است.`;
}
