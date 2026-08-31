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

/**
 * Builds inline action buttons for a claimed Order Admin Notification (PROCESSING status):
 * - [🔒 Processing by @adminX] (non-interactive, callback: order:noop)
 * - [📦 Fulfil Order] (callback: order:fulfil:<orderId>)
 * - [✗ Reject] (callback: order:reject:<orderId>)
 */
export function getAdminOrderProcessingKeyboard(
  orderId: string,
  adminUsernameOrDisplay: string
): InlineKeyboard {
  const display = adminUsernameOrDisplay.startsWith('@')
    ? adminUsernameOrDisplay
    : `@${adminUsernameOrDisplay}`;

  return new InlineKeyboard()
    .text(`🔒 Processing by ${display}`, 'order:noop')
    .row()
    .text('📦 Fulfil Order', `order:fulfil:${orderId}`)
    .text('✗ Reject', `order:reject:${orderId}`);
}

