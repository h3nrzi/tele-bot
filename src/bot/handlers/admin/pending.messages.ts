import { formatUsd, formatIrr } from '@/core/shared/currency.utils';
import type { PendingTopUpRequestItem } from '@/modules/top-up/dtos/top-up.dto';

/**
 * Message returned when the pending top-up queue is empty.
 */
export function getEmptyPendingQueueMessage(): string {
  return '📥 صف درخواست‌های در انتظار خالی است.';
}

/**
 * Calculates human-readable Persian time elapsed since a date.
 */
export function formatTimeAgo(date: Date, now: Date = new Date()): string {
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) {
    return 'لحظاتی پیش';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} دقیقه پیش`;
  }
  if (diffHours < 24) {
    return `${diffHours} ساعت پیش`;
  }
  return `${diffDays} روز پیش`;
}

/**
 * Formats a paginated summary message for pending top-up requests.
 */
export function formatPendingQueuePage(params: {
  items: PendingTopUpRequestItem[];
  page: number;
  totalPages: number;
  totalCount: number;
  startIndex: number;
  now?: Date | undefined;
}): string {
  const { items, page, totalPages, totalCount, startIndex, now } = params;
  const header =
    totalPages > 1
      ? `📋 صف درخواست‌های در انتظار (صفحه ${page} از ${totalPages} - مجموع: ${totalCount} مورد)\n\n`
      : `📋 صف درخواست‌های در انتظار (${totalCount} مورد)\n\n`;

  const lines = items.map((item, index) => {
    const itemNumber = startIndex + index + 1;
    const buyerDisplay = item.telegramUsername
      ? `@${item.telegramUsername} (شناسه: ${item.telegramChatId})`
      : `شناسه: ${item.telegramChatId}`;
    const timeAgo = formatTimeAgo(item.updatedAt ?? item.createdAt, now);
    return (
      `${itemNumber}. خریدار: ${buyerDisplay}\n` +
      `   مبلغ: ${formatUsd(item.usdAmount)} (${formatIrr(item.irrAmount)} ریال)\n` +
      `   زمان ثبت رسید: ${timeAgo}`
    );
  });

  return header + lines.join('\n\n');
}
