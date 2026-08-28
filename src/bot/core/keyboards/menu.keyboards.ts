import { Keyboard } from 'grammy';

/**
 * Main menu reply keyboard for Buyers.
 * Features resized buttons for quick access to wallet and top-up operations,
 * allowing the user to toggle the menu open/closed using Telegram's toggle button.
 */
export function getBuyerMainMenuKeyboard(): Keyboard {
  return new Keyboard()
    .text('💰 موجودی کیف پول')
    .text('➕ افزایش موجودی')
    .row()
    .text('📋 پیگیری وضعیت')
    .text('❌ لغو درخواست')
    .resized();
}

/**
 * Main menu reply keyboard for Admins.
 * Features resized buttons for quick access to administrative controls,
 * allowing the user to toggle the menu open/closed using Telegram's toggle button.
 */
export function getAdminMainMenuKeyboard(): Keyboard {
  return new Keyboard()
    .text('⏳ درخواست‌های در انتظار')
    .text('💳 تنظیم کارت بانکی')
    .row()
    .text('💱 نرخ ارز فعلی')
    .text('✏️ تنظیم نرخ ارز')
    .resized();
}
