import { InlineKeyboard } from 'grammy';

export const PRESET_REJECTION_REASONS: Record<string, string> = {
  wrong_amount: 'مبلغ واریزی اشتباه است',
  unreadable_receipt: 'تصویر رسید ناخوانا یا نامعتبر است',
  duplicate_submission: 'رسید ارسالی تکراری است',
};

export function getRejectionPresetsKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('❌ مبلغ اشتباه', 'reject_reason:wrong_amount')
    .row()
    .text('📄 رسید ناخوانا', 'reject_reason:unreadable_receipt')
    .row()
    .text('🔁 رسید تکراری', 'reject_reason:duplicate_submission')
    .row()
    .text('✏️ سایر / دلیل دلخواه...', 'reject_reason:custom')
    .row()
    .text('🔙 انصراف', 'reject_reason:cancel');
}
