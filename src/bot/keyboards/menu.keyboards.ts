import { Keyboard } from 'grammy';

export function getBuyerMainMenuKeyboard(): Keyboard {
  return new Keyboard()
    .text('🛍️ فروشگاه خدمات')
    .row()
    .text('💰 موجودی کیف پول')
    .text('➕ افزایش موجودی')
    .row()
    .text('📋 پیگیری وضعیت')
    .text('❌ لغو درخواست')
    .resized();
}

export function getAdminMainMenuKeyboard(): Keyboard {
  return new Keyboard()
    .text('📦 کاتالوگ خدمات')
    .text('⏳ درخواست‌های در انتظار')
    .row()
    .text('💳 تنظیم کارت بانکی')
    .text('💱 نرخ ارز فعلی')
    .row()
    .text('✏️ تنظیم نرخ ارز')
    .resized();
}
