import { InlineKeyboard } from 'grammy';
import { formatUsd } from '@/utils/currency';
import type { PendingTopUpRequestItem } from '@/application/top-up/dtos/top-up.dto';

export interface PendingQueueKeyboardOptions {
  items: PendingTopUpRequestItem[];
  page: number;
  totalPages: number;
  startIndex: number;
}

/**
 * Builds the inline keyboard for a pending queue page:
 * - Review button per item on the page
 * - Prev / Next pagination buttons when multiple pages exist
 */
export function getPendingQueueKeyboard(options: PendingQueueKeyboardOptions): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  options.items.forEach((item, index) => {
    const itemNumber = options.startIndex + index + 1;
    keyboard.text(`🔍 Review #${itemNumber} (${formatUsd(item.usdAmount)})`, `review:${item.id}`);
    keyboard.row();
  });

  if (options.totalPages > 1) {
    const navRow: { text: string; data: string }[] = [];
    if (options.page > 1) {
      navRow.push({ text: '← Prev', data: `pending_page:${options.page - 1}` });
    }
    if (options.page < options.totalPages) {
      navRow.push({ text: 'Next →', data: `pending_page:${options.page + 1}` });
    }
    if (navRow.length > 0) {
      navRow.forEach((btn) => keyboard.text(btn.text, btn.data));
    }
  }

  return keyboard;
}
