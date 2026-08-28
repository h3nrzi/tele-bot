import { Keyboard } from 'grammy';

export function getBuyerMainMenuKeyboard(): Keyboard {
  return new Keyboard()
    .text('💰 موجودی کیف پول')
    .text('➕ افزایش موجودی')
    .row()
    .text('📋 پیگیری وضعیت')
    .text('❌ لغو درخواست')
    .resized();
}

export function getAdminMainMenuKeyboard(): Keyboard {
  return new Keyboard()
    .text('⏳ درخواست‌های در انتظار')
    .row()
    .text('💳 تنظیم کارت بانکی')
    .text('💱 نرخ ارز فعلی')
    .row()
    .text('✏️ تنظیم نرخ ارز')
    .resized();
}
