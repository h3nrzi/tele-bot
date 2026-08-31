import { InlineKeyboard } from 'grammy';

/**
 * Builds inline action buttons for an Order Admin Notification:
 * - [▶ شروع پردازش] (order:process:<orderId>)
 * - [✗ رد سفارش] (order:reject:<orderId>)
 */
export function getAdminOrderNotificationKeyboard(orderId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('▶ شروع پردازش', `order:process:${orderId}`)
    .text('✗ رد سفارش', `order:reject:${orderId}`);
}
