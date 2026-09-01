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
    .text(`🔒 در حال پردازش توسط ${display}`, 'order:noop')
    .row()
    .text('📦 تحویل سفارش', `order:fulfil:${orderId}`)
    .text('✗ رد سفارش', `order:reject:${orderId}`);
}

/**
 * Builds inline confirmation buttons for the 3-step fulfilment conversation:
 * - [✓ ارسال] (fulfil:confirm)
 * - [🔄 ویرایش مجدد] (fulfil:reenter)
 * - [❌ انصراف] (flow:cancel)
 */
export function getFulfilOrderConfirmationKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('✓ ارسال', 'fulfil:confirm')
    .text('🔄 ویرایش مجدد', 'fulfil:reenter')
    .row()
    .text('❌ انصراف', 'flow:cancel');
}

/**
 * Builds inline status display for a fulfilled Order Admin Notification (FULFILLED status):
 * - [✅ تکمیل شده توسط @adminX] (non-interactive, callback: order:noop)
 */
export function getAdminOrderFulfilledKeyboard(
  adminUsernameOrDisplay: string
): InlineKeyboard {
  const display = formatAdminDisplay(adminUsernameOrDisplay);

  return new InlineKeyboard().text(`✅ تکمیل شده توسط ${display}`, 'order:noop');
}

