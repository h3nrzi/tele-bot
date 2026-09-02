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
  if (!adminUsernameOrDisplay) {
    return '';
  }
  if (adminUsernameOrDisplay.startsWith('@')) {
    return adminUsernameOrDisplay;
  }
  if (/^\d+$/.test(adminUsernameOrDisplay) || /\s/.test(adminUsernameOrDisplay)) {
    return adminUsernameOrDisplay;
  }
  return `@${adminUsernameOrDisplay}`;
}

/**
 * Iterates through admin notifications and edits their inline reply markup.
 */
export async function editAdminOrderNotificationMessages(
  api: { editMessageReplyMarkup: (chatId: number, messageId: number, options: { reply_markup: InlineKeyboard }) => Promise<unknown> },
  notifications: Array<{ chatId: bigint | number | string; messageId: bigint | number | string; adminTelegramId?: bigint | number | string }>,
  replyMarkup: InlineKeyboard
): Promise<void> {
  for (const notif of notifications) {
    try {
      await api.editMessageReplyMarkup(
        Number(notif.chatId),
        Number(notif.messageId),
        {
          reply_markup: replyMarkup,
        }
      );
    } catch (editErr) {
      console.error(
        `Failed to edit notification for admin ${notif.adminTelegramId ?? notif.chatId}:`,
        editErr
      );
    }
  }
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

export const ORDER_REJECTION_CATEGORIES = {
  OUT_OF_STOCK: {
    code: 'OUT_OF_STOCK',
    label: 'عدم موجودی / ناموجود موقت',
    labelEn: 'Out of stock / temporarily unavailable',
    buttonText: '📦 عدم موجودی / Out of stock',
  },
  CANNOT_VERIFY: {
    code: 'CANNOT_VERIFY',
    label: 'عدم امکان احراز اصالت سفارش',
    labelEn: 'Cannot verify order legitimacy',
    buttonText: '🔍 عدم احراز اصالت / Cannot verify',
  },
  TECHNICAL_ISSUE: {
    code: 'TECHNICAL_ISSUE',
    label: 'مشکل فنی — عدم امکان تحویل',
    labelEn: 'Technical issue — unable to fulfil',
    buttonText: '⚙️ مشکل فنی / Technical issue',
  },
  POLICY_VIOLATION: {
    code: 'POLICY_VIOLATION',
    label: 'نقض قوانین و مقررات',
    labelEn: 'Policy violation',
    buttonText: '⚠️ نقض قوانین / Policy violation',
  },
  OTHER: {
    code: 'OTHER',
    label: 'سایر (نیاز به توضیح)',
    labelEn: 'Other (enter text)',
    buttonText: '✏️ سایر / Other (enter text)',
  },
} as const;

export type OrderRejectionCategoryCode = keyof typeof ORDER_REJECTION_CATEGORIES;

/**
 * Builds inline keyboard presenting 5 preset category buttons for Order rejection:
 * 1. Out of stock / temporarily unavailable
 * 2. Cannot verify order legitimacy
 * 3. Technical issue — unable to fulfil
 * 4. Policy violation
 * 5. Other (enter text)
 * + Cancel
 */
export function getOrderRejectionCategoriesKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text(
      ORDER_REJECTION_CATEGORIES.OUT_OF_STOCK.buttonText,
      'order_reject_cat:OUT_OF_STOCK'
    )
    .row()
    .text(
      ORDER_REJECTION_CATEGORIES.CANNOT_VERIFY.buttonText,
      'order_reject_cat:CANNOT_VERIFY'
    )
    .row()
    .text(
      ORDER_REJECTION_CATEGORIES.TECHNICAL_ISSUE.buttonText,
      'order_reject_cat:TECHNICAL_ISSUE'
    )
    .row()
    .text(
      ORDER_REJECTION_CATEGORIES.POLICY_VIOLATION.buttonText,
      'order_reject_cat:POLICY_VIOLATION'
    )
    .row()
    .text(
      ORDER_REJECTION_CATEGORIES.OTHER.buttonText,
      'order_reject_cat:OTHER'
    )
    .row()
    .text('❌ انصراف', 'flow:cancel');
}

/**
 * Builds inline keyboard for optional note prompt:
 * - [⏩ رد کردن (بدون یادداشت) / Skip] (only when includeSkip is true)
 * - [❌ انصراف] (flow:cancel)
 */
export function getOrderRejectionNotePromptKeyboard(
  includeSkip = true
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (includeSkip) {
    keyboard.text('⏩ رد کردن (بدون یادداشت)', 'order_reject_note:skip').row();
  }
  keyboard.text('❌ انصراف', 'flow:cancel');
  return keyboard;
}

/**
 * Builds inline status display for a rejected Order Admin Notification (REJECTED status):
 * - [❌ رد شده توسط @adminX] (non-interactive, callback: order:noop)
 */
export function getAdminOrderRejectedKeyboard(
  adminUsernameOrDisplay?: string
): InlineKeyboard {
  if (adminUsernameOrDisplay) {
    const display = formatAdminDisplay(adminUsernameOrDisplay);
    return new InlineKeyboard().text(`❌ رد شده توسط ${display}`, 'order:noop');
  }
  return new InlineKeyboard().text('❌ سفارش رد شد', 'order:noop');
}

/**
 * Builds inline status display for a cancelled Order Admin Notification (CANCELLED status):
 * - [🚫 لغو شده توسط خریدار] (non-interactive, callback: order:noop)
 */
export function getAdminOrderCancelledKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('🚫 لغو شده توسط خریدار', 'order:noop');
}


