import { InlineKeyboard } from 'grammy';

export const PRESET_REJECTION_REASONS: Record<string, string> = {
  wrong_amount: 'Wrong amount',
  unreadable_receipt: 'Unreadable receipt',
  duplicate_submission: 'Duplicate submission',
};

export function getRejectionPresetsKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('❌ مبلغ اشتباه / Wrong amount', 'reject_reason:wrong_amount')
    .row()
    .text('📄 رسید ناخوانا / Unreadable receipt', 'reject_reason:unreadable_receipt')
    .row()
    .text('🔁 رسید تکراری / Duplicate submission', 'reject_reason:duplicate_submission')
    .row()
    .text('✏️ سایر / دلیل دلخواه / Other / custom…', 'reject_reason:custom')
    .row()
    .text('🔙 انصراف / Cancel', 'reject_reason:cancel');
}
