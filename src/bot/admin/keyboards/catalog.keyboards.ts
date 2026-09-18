import { InlineKeyboard } from "grammy";
import {
	DEFAULT_CATALOG_STRATEGY,
	type CatalogItem,
	type CatalogType,
	type FulfillmentStrategy,
	type VpnRequirementConfig,
} from "@/modules/catalog/catalog.entity";

export { DEFAULT_CATALOG_STRATEGY };

export interface CatalogItemViewData {
	id: string;
	name: string;
	description?: string | null | undefined;
	usdPrice: string;
	isActive: boolean;
	catalogType?: CatalogType | undefined;
	fulfillmentStrategy?: FulfillmentStrategy | undefined;
	requirementConfig?: Record<string, unknown> | null | undefined;
}

export const CATALOG_TYPE_LABELS: Record<CatalogType, string> = {
	STATIC_DELIVERY: "تحویل محتوا / لایسنس (STATIC_DELIVERY)",
	DIRECT_ACCOUNT: "ارتقای مستقیم اکانت (DIRECT_ACCOUNT)",
	IDENTITY_HANDLE: "شناسه کاربری / تلگرام (IDENTITY_HANDLE)",
	CONFIG_VPN: "کانفیگ VPN (CONFIG_VPN)",
};

export const FULFILLMENT_STRATEGY_LABELS: Record<FulfillmentStrategy, string> = {
	PAYLOAD_DELIVERY: "تحویل متن / لایسنس (PAYLOAD_DELIVERY)",
	ACTIVATION: "فعال‌سازی مستقیم (ACTIVATION)",
	AUTOMATED_PANEL: "پنل خودکار (AUTOMATED_PANEL)",
};

/**
 * Formats allowed regions from requirementConfig into a readable line if present.
 */
export function formatRequirementRegions(
	requirementConfig?: Record<string, unknown> | VpnRequirementConfig | null | undefined,
): string {
	if (
		requirementConfig &&
		"allowedRegions" in requirementConfig &&
		Array.isArray(requirementConfig.allowedRegions) &&
		requirementConfig.allowedRegions.length > 0
	) {
		return `\n🌐 مناطق سرور: ${requirementConfig.allowedRegions.join(", ")}`;
	}
	return "";
}

export interface VpnRegionPreset {
	code: string;
	label: string;
	regions: string[];
}

export const VPN_REGION_PRESETS: VpnRegionPreset[] = [
	{ code: "eu", label: "🇪🇺 اروپا (آلمان، هلند، فنلاند)", regions: ["de", "nl", "fi"] },
	{ code: "global", label: "🌍 چندمنطقه‌ای (آلمان، هلند، آمریکا، انگلیس)", regions: ["de", "nl", "us", "gb"] },
	{ code: "de", label: "🇩🇪 تک‌سرور آلمان", regions: ["de"] },
	{ code: "nl", label: "🇳🇱 تک‌سرور هلند", regions: ["nl"] },
];

/**
 * Builds the inline keyboard for selecting a CatalogType.
 */
export function getCatalogTypeSelectionKeyboard(): InlineKeyboard {
	return new InlineKeyboard()
		.text("📦 تحویل محتوا / لایسنس", "catalog:type:STATIC_DELIVERY")
		.row()
		.text("👤 ارتقای مستقیم اکانت", "catalog:type:DIRECT_ACCOUNT")
		.row()
		.text("🆔 شناسه کاربری / تلگرام", "catalog:type:IDENTITY_HANDLE")
		.row()
		.text("🌐 کانفیگ VPN", "catalog:type:CONFIG_VPN")
		.row()
		.text("❌ انصراف", "flow:cancel");
}

/**
 * Builds the inline keyboard for selecting or confirming a FulfillmentStrategy.
 */
export function getCatalogStrategySelectionKeyboard(suggestedStrategy: FulfillmentStrategy): InlineKeyboard {
	const keyboard = new InlineKeyboard();

	keyboard
		.text(`✓ تایید پیش‌فرض (${FULFILLMENT_STRATEGY_LABELS[suggestedStrategy]})`, "catalog:strategy:confirm_default")
		.row();

	const allStrategies: FulfillmentStrategy[] = ["PAYLOAD_DELIVERY", "ACTIVATION", "AUTOMATED_PANEL"];
	for (const strat of allStrategies) {
		if (strat !== suggestedStrategy) {
			keyboard.text(`🔄 تغییر به: ${FULFILLMENT_STRATEGY_LABELS[strat]}`, `catalog:strategy:override:${strat}`).row();
		}
	}

	keyboard.text("❌ انصراف", "flow:cancel");
	return keyboard;
}

/**
 * Builds the inline keyboard for choosing VPN region presets.
 */
export function getVpnRegionPresetsKeyboard(): InlineKeyboard {
	const keyboard = new InlineKeyboard();
	for (const preset of VPN_REGION_PRESETS) {
		keyboard.text(preset.label, `catalog:region:preset:${preset.code}`).row();
	}
	keyboard.text("❌ انصراف", "flow:cancel");
	return keyboard;
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
	const typeText = item.catalogType ? `\n🗂 نوع خدمت: ${CATALOG_TYPE_LABELS[item.catalogType] ?? item.catalogType}` : "";
	const strategyText = item.fulfillmentStrategy
		? `\n⚙️ نحوه تحویل: ${FULFILLMENT_STRATEGY_LABELS[item.fulfillmentStrategy] ?? item.fulfillmentStrategy}`
		: "";
	const regionsText = formatRequirementRegions(item.requirementConfig);

	const messageText =
		`📦 جزئیات خدمت\n\n` +
		`🏷 نام خدمت: ${item.name}\n` +
		`🔘 وضعیت: ${statusText}\n` +
		`💰 قیمت: $${item.usdPrice}\n` +
		`📝 توضیحات: ${descText}` +
		typeText +
		strategyText +
		regionsText +
		`\n\nبرای ویرایش یا تغییر وضعیت این خدمت، از دکمه‌های زیر استفاده کنید:`;

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
