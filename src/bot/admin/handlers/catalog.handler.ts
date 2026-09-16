import type { Context } from "grammy";
import type { CatalogService } from "@/modules/catalog/catalog.service";
import { isAdmin } from "@/bot/middleware/admin.middleware";
import {
	buildCatalogDashboardView,
	ADD_CATALOG_ITEM_CONVERSATION_ID,
	EDIT_CATALOG_ITEM_CONVERSATION_ID,
} from "@/bot/admin/conversations/catalog.conversation";
import { buildCatalogItemDetailView } from "@/bot/admin/keyboards/catalog.keyboards";
import type { BotContext } from "@/bot/context";

export interface CatalogHandlerOptions {
	adminIds?: string | Set<bigint> | undefined;
}

/**
 * Handles the /catalog Admin command.
 * Restricted to Admins; non-Admins receive an access-denied message.
 */
export async function handleCatalogCommand(
	ctx: Context,
	catalogService: CatalogService,
	options?: CatalogHandlerOptions,
): Promise<void> {
	const senderId = ctx.from?.id;

	if (!isAdmin(senderId, options?.adminIds)) {
		await ctx.reply("⛔ دسترسی غیرمجاز. این دستور فقط برای مدیران سیستم قابل استفاده است.");
		return;
	}

	const items = await catalogService.listAll();
	const { messageText, keyboard } = buildCatalogDashboardView(items);

	await ctx.reply(messageText, {
		reply_markup: keyboard,
	});
}

/**
 * Handles viewing a single Catalog Item and displaying its action buttons.
 */
export async function handleCatalogViewCallback(ctx: Context, catalogService: CatalogService): Promise<void> {
	const callbackData = ctx.callbackQuery?.data;
	const match = callbackData?.match(/^catalog:view:(.+)$/);

	if (!match || !match[1]) {
		try {
			await ctx.answerCallbackQuery({
				text: "⚠️ شناسه خدمت نامعتبر است.",
				show_alert: true,
			});
		} catch {}
		return;
	}

	const itemId = match[1];

	try {
		const item = await catalogService.findById(itemId);
		if (!item) {
			try {
				await ctx.answerCallbackQuery({
					text: "⚠️ خدمت مورد نظر در سیستم یافت نشد.",
					show_alert: true,
				});
			} catch {}
			return;
		}

		try {
			await ctx.answerCallbackQuery();
		} catch {}

		const { messageText, keyboard } = buildCatalogItemDetailView(item);

		try {
			await ctx.editMessageText(messageText, {
				reply_markup: keyboard,
			});
		} catch (editErr) {
			console.error("Failed to edit catalog item view:", editErr);
		}
	} catch (err) {
		console.error("Failed to view catalog item:", err);
		try {
			await ctx.answerCallbackQuery({
				text: "❌ خطا در بارگذاری اطلاعات خدمت.",
				show_alert: true,
			});
		} catch {}
	}
}

/**
 * Handles returning to the Catalog dashboard list from an item detail view.
 */
export async function handleCatalogListCallback(ctx: Context, catalogService: CatalogService): Promise<void> {
	try {
		await ctx.answerCallbackQuery();
	} catch {}

	try {
		const items = await catalogService.listAll();
		const { messageText, keyboard } = buildCatalogDashboardView(items);

		try {
			await ctx.editMessageText(messageText, {
				reply_markup: keyboard,
			});
		} catch (editErr) {
			console.error("Failed to edit catalog dashboard list view:", editErr);
		}
	} catch (err) {
		console.error("Failed to load catalog list:", err);
	}
}

/**
 * Handles toggling a Catalog Item's is_active status and refreshing its detail view.
 */
export async function handleCatalogToggleCallback(ctx: Context, catalogService: CatalogService): Promise<void> {
	const callbackData = ctx.callbackQuery?.data;
	const match = callbackData?.match(/^catalog:toggle:(.+)$/);

	if (!match || !match[1]) {
		try {
			await ctx.answerCallbackQuery({
				text: "⚠️ شناسه نامعتبر است.",
				show_alert: true,
			});
		} catch {}
		return;
	}

	const itemId = match[1];

	try {
		const updated = await catalogService.toggleActive(itemId);

		try {
			await ctx.answerCallbackQuery({
				text: updated.isActive ? "🟢 خدمت فعال شد." : "🔴 خدمت غیرفعال شد.",
			});
		} catch {}

		const { messageText, keyboard } = buildCatalogItemDetailView(updated);

		try {
			await ctx.editMessageText(messageText, {
				reply_markup: keyboard,
			});
		} catch (editErr) {
			console.error("Failed to edit catalog item detail view:", editErr);
		}
	} catch (err) {
		console.error("Failed to toggle catalog item status:", err);
		try {
			await ctx.answerCallbackQuery({
				text: "❌ خطا در تغییر وضعیت خدمت.",
				show_alert: true,
			});
		} catch {}
	}
}

/**
 * Handles the [+ Add New] callback query by entering the add catalog conversation.
 */
export async function handleCatalogAddCallback(ctx: BotContext): Promise<void> {
	await ctx.conversation.enter(ADD_CATALOG_ITEM_CONVERSATION_ID);
}

/**
 * Handles the [Edit] callback query by entering the edit catalog conversation.
 */
export async function handleCatalogEditCallback(ctx: BotContext): Promise<void> {
	await ctx.conversation.enter(EDIT_CATALOG_ITEM_CONVERSATION_ID);
}
