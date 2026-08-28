import { InlineKeyboard } from 'grammy';

export function getAdminReceiptKeyboard(requestId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Approve', `approve:${requestId}`)
    .text('❌ Reject', `reject:${requestId}`);
}
