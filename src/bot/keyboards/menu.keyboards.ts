import { Keyboard } from "grammy";

export function getBuyerMainMenuKeyboard(): Keyboard {
	return new Keyboard().text("🛍️ فروشگاه خدمات").text("👤 حساب کاربری").row().text("💳 مدیریت کیف پول").resized();
}

export function getBuyerWalletMenuKeyboard(): Keyboard {
	return new Keyboard()
		.text("💰 موجودی کیف پول")
		.text("➕ درخواست افزایش")
		.row()
		.text("📋 پیگیری وضعیت")
		.text("❌ لغو درخواست")
		.row()
		.text("🔙 بازگشت به منوی اصلی")
		.resized();
}

export function getAdminMainMenuKeyboard(): Keyboard {
	return new Keyboard()
		.text("📦 کاتالوگ خدمات")
		.text("📋 سفارش‌های فعال")
		.row()
		.text("⏳ درخواست‌های در انتظار")
		.text("⚙️ تنظیمات نرخ ارز و حساب")
		.resized();
}

export function getAdminSettingsMenuKeyboard(): Keyboard {
	return new Keyboard()
		.text("💱 نرخ ارز فعلی")
		.text("✏️ تنظیم نرخ ارز")
		.row()
		.text("🔄 حالت نرخ ارز")
		.text("📊 تنظیم اسپرد")
		.row()
		.text("💳 تنظیم کارت بانکی")
		.row()
		.text("🔙 بازگشت به منوی اصلی")
		.resized();
}
