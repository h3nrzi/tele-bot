import { InlineKeyboard } from 'grammy';
import type { Order, OrderStatus } from '@/modules/order/order.entity';
import type { CatalogItem } from '@/modules/catalog/catalog.entity';
import { formatUsd } from '@/core/shared/currency.utils';

export interface MyOrderViewResult {
  messageText: string;
  keyboard: InlineKeyboard;
  hasCancelButton: boolean;
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PLACED: 'ثبت شده (در انتظار پردازش)',
  PROCESSING: 'در حال پردازش',
  FULFILLED: 'تکمیل و تحویل داده شده',
  REJECTED: 'رد شده',
  CANCELLED: 'لغو شده',
};

/**
 * Builds the text and inline keyboard for the /myorder Buyer command.
 */
export function buildMyOrderView(
  order: Order | null,
  catalogItem: CatalogItem | null
): MyOrderViewResult {
  if (!order) {
    return {
      messageText: 'شما تاکنون هیچ سفارشی ثبت نکرده‌اید.',
      keyboard: new InlineKeyboard(),
      hasCancelButton: false,
    };
  }

  const itemName = catalogItem ? catalogItem.name : 'خدمت انتخابی';
  const statusLabel = ORDER_STATUS_LABELS[order.status] ?? order.status;

  let messageText =
    `📦 *وضعیت آخرین سفارش شما:*\n\n` +
    `🆔 شناسه سفارش: #${order.id}\n` +
    `🛍️ نام خدمت: ${itemName}\n` +
    `💵 مبلغ سفارش: ${formatUsd(order.usdPriceSnapshot)}\n` +
    `📊 وضعیت: ${statusLabel}\n` +
    `📅 تاریخ ثبت: ${order.createdAt.toISOString()}`;

  if (order.status === 'PROCESSING') {
    messageText += `\n\nℹ️ سفارش شما در حال حاضر در حال پردازش توسط ادمین است و امکان لغو آن وجود ندارد.`;
  } else if (order.status === 'REJECTED' && order.rejectionCategory) {
    messageText += `\n\nعلت رد سفارش: ${order.rejectionNote || order.rejectionCategory}`;
  } else if (order.status === 'FULFILLED' && order.deliveryContent) {
    messageText += `\n\n📦 مشخصات تحویل:\n${order.deliveryContent}`;
  }

  const keyboard = new InlineKeyboard();
  let hasCancelButton = false;

  if (order.status === 'PLACED') {
    keyboard.text('❌ لغو سفارش', `order:cancel:${order.id}`);
    hasCancelButton = true;
  }

  return {
    messageText,
    keyboard,
    hasCancelButton,
  };
}
