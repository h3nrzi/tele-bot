import { Keyboard } from 'grammy';

export function getBuyerMainMenuKeyboard(): Keyboard {
  return new Keyboard()
    .text('🛍️ فروشگاه خدمات')
    .text('📦 آخرین سفارش')
    .row()
    .text('💰 مدیریت کیف پول')
    .resized();
}

export function getBuyerWalletMenuKeyboard(): Keyboard {
  return new Keyboard()
    .text('💰 موجودی کیف پول')
    .text('➕ افزایش درخواست')
    .row()
    .text('📋 پیگیری وضعیت')
    .text('❌ لغو درخواست')
    .row()
    .text('🔙 بازگشت به منوی اصلی')
    .resized();
}

export function getAdminMainMenuKeyboard(): Keyboard {
  return new Keyboard()
    .text('📦 کاتالوگ خدمات')
    .text('⏳ درخواست‌های در انتظار')
    .row()
    .text('⚙️ تنظیمات نرخ ارز و حساب')
    .resized();
}

export function getAdminSettingsMenuKeyboard(): Keyboard {
  return new Keyboard()
    .text('💱 نرخ ارز فعلی')
    .text('✏️ تنظیم نرخ ارز')
    .row()
    .text('💳 تنظیم کارت بانکی')
    .row()
    .text('🔙 بازگشت به منوی اصلی')
    .resized();
}
