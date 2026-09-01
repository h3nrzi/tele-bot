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

export function formatAdminDisplay(adminUsernameOrDisplay: string): string {
  return adminUsernameOrDisplay.startsWith('@')
    ? adminUsernameOrDisplay
    : `@${adminUsernameOrDisplay}`;
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
  const display = formatAdminDisplay(adminUsernameOrDisplay);

  return new InlineKeyboard()
    .text(`🔒 Processing by ${display}`, 'order:noop')
    .row()
    .text('📦 Fulfil Order', `order:fulfil:${orderId}`)
    .text('✗ Reject', `order:reject:${orderId}`);
}

/**
 * Builds inline confirmation buttons for the 3-step fulfilment conversation:
 * - [✓ Send] (fulfil:confirm)
 * - [✗ Re-enter] (fulfil:reenter)
 * - [❌ انصراف] (flow:cancel)
 */
export function getFulfilOrderConfirmationKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('✓ Send', 'fulfil:confirm')
    .text('✗ Re-enter', 'fulfil:reenter')
    .row()
    .text('❌ انصراف', 'flow:cancel');
}

/**
 * Builds inline status display for a fulfilled Order Admin Notification (FULFILLED status):
 * - [✅ Fulfilled by @adminX] (non-interactive, callback: order:noop)
 */
export function getAdminOrderFulfilledKeyboard(
  adminUsernameOrDisplay: string
): InlineKeyboard {
  const display = formatAdminDisplay(adminUsernameOrDisplay);

  return new InlineKeyboard().text(`✅ Fulfilled by ${display}`, 'order:noop');
}

