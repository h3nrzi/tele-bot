import { InlineKeyboard } from "grammy";
import type { CatalogItem } from "@/modules/catalog/catalog.entity";

export interface CatalogItemViewData {
	id: string;
	name: string;
	description?: string | null | undefined;
	usdPrice: string;
	isActive: boolean;
}

/**
 * Builds the inline keyboard for the Admin Catalog dashboard.
 * - Each item is displayed as a button with its status, name, and price.
 * - [+ Add New] button at the bottom.
 */
export function getCatalogDashboardKeyboard(items: (CatalogItem | CatalogItemViewData)[]): InlineKeyboard {
	const keyboard = new InlineKeyboard();

	for (const item of items) {
		const statusIcon = item.isActive ? "🟢" : "🔴";
		keyboard.text(`${statusIcon} ${item.name} - $${item.usdPrice}`, `catalog:view:${item.id}`).row();
	}

	keyboard.text("➕ افزودن خدمت جدید", "catalog:add");

	return keyboard;
}

/**
 * Builds the inline keyboard for a single Catalog Item's action view.
 * - Row 1: [Edit] and [Deactivate] / [Reactivate]
 * - Row 2: [Back to Services List]
 */
export function getCatalogItemDetailKeyboard(item: CatalogItem | CatalogItemViewData): InlineKeyboard {
	const toggleLabel = item.isActive ? "🔴 غیرفعال‌سازی" : "🟢 فعال‌سازی";
	return new InlineKeyboard()
		.text("✏️ ویرایش", `catalog:edit:${item.id}`)
		.text(toggleLabel, `catalog:toggle:${item.id}`)
		.row()
		.text("🔙 بازگشت به لیست خدمات", "catalog:list");
}

/**
 * Builds the detail view message text and action keyboard for a single Catalog Item.
 */
export function buildCatalogItemDetailView(item: CatalogItem | CatalogItemViewData): {
	messageText: string;
	keyboard: InlineKeyboard;
} {
	const statusText = item.isActive ? "🟢 فعال" : "🔴 غیرفعال";
	const descText = item.description ? item.description : "ندارد";

	const messageText =
		`📦 جزئیات خدمت\n\n` +
		`🏷 نام خدمت: ${item.name}\n` +
		`🔘 وضعیت: ${statusText}\n` +
		`💰 قیمت: $${item.usdPrice}\n` +
		`📝 توضیحات: ${descText}\n\n` +
		`برای ویرایش یا تغییر وضعیت این خدمت، از دکمه‌های زیر استفاده کنید:`;

	return {
		messageText,
		keyboard: getCatalogItemDetailKeyboard(item),
	};
}

/**
 * Inline keyboard with [Skip] and [Cancel] buttons for optional fields.
 */
export function getSkipInlineKeyboard(): InlineKeyboard {
	return new InlineKeyboard().text("⏭ رد شدن (بدون توضیحات)", "flow:skip").row().text("❌ انصراف", "flow:cancel");
}

/**
 * Inline keyboard with [Keep] and [Cancel] buttons for editing.
 */
export function getKeepInlineKeyboard(includeSkip = false): InlineKeyboard {
	const keyboard = new InlineKeyboard().text("حفظ مقدار فعلی", "flow:keep");
	if (includeSkip) {
		keyboard.text("حذف توضیحات", "flow:skip");
	}
	keyboard.row().text("❌ انصراف", "flow:cancel");
	return keyboard;
}

/**
 * Inline keyboard for confirmation step.
 */
export function getConfirmationInlineKeyboard(): InlineKeyboard {
	return new InlineKeyboard().text("✓ تایید و ثبت", "flow:confirm").text("✗ انصراف", "flow:cancel");
}
