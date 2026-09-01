import { InlineKeyboard } from 'grammy';

export function getAdminReceiptKeyboard(requestId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ تایید', `approve:${requestId}`)
    .text('❌ رد', `reject:${requestId}`);
}
