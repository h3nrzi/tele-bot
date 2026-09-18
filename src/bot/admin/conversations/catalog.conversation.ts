import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import Decimal from "decimal.js";
import type { BotConversation } from "@/bot/context";
import type { CatalogService } from "@/modules/catalog/catalog.service";
import { isCancelCommand as isCancelUtil } from "@/core/shared/telegram.utils";
import {
	getCatalogDashboardKeyboard,
	getSkipInlineKeyboard,
	getKeepInlineKeyboard,
	getConfirmationInlineKeyboard,
	getCatalogTypeSelectionKeyboard,
	getCatalogStrategySelectionKeyboard,
	getVpnRegionPresetsKeyboard,
	CATALOG_TYPE_LABELS,
	FULFILLMENT_STRATEGY_LABELS,
	DEFAULT_CATALOG_STRATEGY,
	VPN_REGION_PRESETS,
	formatRequirementRegions,
	type CatalogItemViewData,
} from "@/bot/admin/keyboards/catalog.keyboards";
import type { CatalogItem, CatalogType, FulfillmentStrategy } from "@/modules/catalog/catalog.entity";

export type AddCatalogItemConversation = BotConversation;
export type EditCatalogItemConversation = BotConversation;

export const ADD_CATALOG_ITEM_CONVERSATION_ID = "add_catalog_item";
export const EDIT_CATALOG_ITEM_CONVERSATION_ID = "edit_catalog_item";

/**
 * Checks if input is a cancel command.
 */
export function isCancelCommand(text: string): boolean {
	const trimmed = text.trim().toLowerCase();
	return trimmed === "لغو" || trimmed === "انصراف" || isCancelUtil(trimmed);
}

/**
 * Checks if input is a skip command for optional fields.
 */
export function isSkipCommand(text: string): boolean {
	const trimmed = text.trim().toLowerCase();
	return trimmed === "-" || trimmed === "skip" || trimmed === "رد" || trimmed.startsWith("/skip") || trimmed === "";
}

/**
 * Checks if input is a keep command to preserve existing value during edit.
 */
export function isKeepCommand(text: string): boolean {
	const trimmed = text.trim().toLowerCase();
	return trimmed === "-" || trimmed === "keep" || trimmed === "حفظ" || trimmed.startsWith("/keep");
}

/**
 * Checks if input is a confirmation response (yes / confirm).
 */
export function isConfirmCommand(text: string): boolean {
	const trimmed = text.trim().toLowerCase();
	return (
		trimmed === "yes" ||
		trimmed === "y" ||
		trimmed === "بله" ||
		trimmed === "تایید" ||
		trimmed === "تأیید" ||
		trimmed === "ok" ||
		trimmed === "confirm" ||
		trimmed.startsWith("/confirm")
	);
}

/**
 * Parses and validates a user USD price string. Returns formatted 2-decimal string or null if invalid.
 */
export function parseUsdInput(text: string): string | null {
	const cleanStr = text.trim().replace(/^\$/, "");
	try {
		const dec = new Decimal(cleanStr);
		if (!dec.isNaN() && dec.gt(0)) {
			return dec.toFixed(2);
		}
	} catch {}
	return null;
}

/**
 * Helper to build dashboard view message text and keyboard.
 */
export function buildCatalogDashboardView(items: (CatalogItem | CatalogItemViewData)[]): {
	messageText: string;
	keyboard: ReturnType<typeof getCatalogDashboardKeyboard>;
} {
	if (items.length === 0) {
		return {
			messageText:
				"📦 کاتالوگ خدمات\n\n" +
				"هیچ خدمتی در کاتالوگ ثبت نشده است.\n" +
				"برای افزودن اولین خدمت از دکمه زیر استفاده کنید:",
			keyboard: getCatalogDashboardKeyboard([]),
		};
	}

	const messageText =
		`📦 مدیریت کاتالوگ خدمات (مجموع: ${items.length} خدمت)\n\n` +
		"جهت مشاهده جزئیات، ویرایش یا تغییر وضعیت، خدمت مورد نظر را انتخاب کنید:";

	return {
		messageText,
		keyboard: getCatalogDashboardKeyboard(items),
	};
}

/**
 * Fetches the full catalog and renders the dashboard reply.
 */
async function refreshAndSendDashboard(
	conversation: BotConversation,
	catalogService: CatalogService,
	ctx: Context,
): Promise<void> {
	const allItems = await conversation.external(async () => {
		const list = await catalogService.listAll();
		return list.map((item) => ({
			id: item.id,
			name: item.name,
			description: item.description,
			usdPrice: item.usdPrice,
			isActive: item.isActive,
			catalogType: item.catalogType,
			fulfillmentStrategy: item.fulfillmentStrategy,
			requirementConfig: item.requirementConfig,
		}));
	});

	const { messageText, keyboard } = buildCatalogDashboardView(allItems);
	await ctx.reply(messageText, { reply_markup: keyboard });
}

/**
 * Creates the grammY conversation for Admin adding a new Catalog Item.
 * Flow:
 *  1. prompt name
 *  2. description (with [Skip] option)
 *  3. catalogType (inline buttons)
 *  4. fulfillmentStrategy (auto-suggest default with option to confirm or override)
 *  5. allowed regions (if CONFIG_VPN, presets or custom text)
 *  6. price
 *  7. preview & confirmation
 *  8. create & refresh dashboard
 */
export function createAddCatalogItemConversation(catalogService: CatalogService) {
	return async function addCatalogItem(conversation: AddCatalogItemConversation, ctx: Context): Promise<void> {
		if (ctx.callbackQuery) {
			try {
				await ctx.answerCallbackQuery();
			} catch {}
		}

		// Step 1: Prompt Name
		await ctx.reply("📦 افزودن خدمت جدید\n\nلطفاً نام خدمت را وارد کنید:", {
			reply_markup: new InlineKeyboard().text("❌ انصراف", "flow:cancel"),
		});

		let name = "";
		while (true) {
			const nameCtx = await conversation.wait();
			const text = nameCtx.message?.text ?? "";
			const callbackData = nameCtx.callbackQuery?.data;

			if (callbackData === "flow:cancel" || isCancelCommand(text)) {
				if (nameCtx.callbackQuery) {
					try {
						await nameCtx.answerCallbackQuery();
					} catch {}
				}
				await nameCtx.reply("❌ عملیات افزودن خدمت جدید لغو شد.");
				return;
			}

			if (text.trim().length > 0) {
				name = text.trim();
				break;
			}

			await nameCtx.reply("❌ نام خدمت نمی‌تواند خالی باشد. لطفاً نام خدمت را وارد کنید:", {
				reply_markup: new InlineKeyboard().text("❌ انصراف", "flow:cancel"),
			});
		}

		// Step 2: Prompt Description (with [Skip] button)
		await ctx.reply("لطفاً توضیحات خدمت را وارد کنید (یا دکمه [رد شدن] را بزنید):", {
			reply_markup: getSkipInlineKeyboard(),
		});

		const descCtx = await conversation.wait();
		const descText = descCtx.message?.text ?? "";
		const descCallback = descCtx.callbackQuery?.data;

		if (descCallback === "flow:cancel" || isCancelCommand(descText)) {
			if (descCtx.callbackQuery) {
				try {
					await descCtx.answerCallbackQuery();
				} catch {}
			}
			await descCtx.reply("❌ عملیات افزودن خدمت جدید لغو شد.");
			return;
		}

		let description: string | null = null;
		if (descCallback === "flow:skip" || isSkipCommand(descText)) {
			if (descCtx.callbackQuery) {
				try {
					await descCtx.answerCallbackQuery();
				} catch {}
			}
			description = null;
		} else {
			description = descText.trim() || null;
		}

		// Step 3: Prompt CatalogType (inline buttons)
		await ctx.reply("🗂 لطفاً نوع خدمت را از گزینه‌های زیر انتخاب کنید:", {
			reply_markup: getCatalogTypeSelectionKeyboard(),
		});

		let catalogType: CatalogType;
		while (true) {
			const typeCtx = await conversation.wait();
			const typeText = typeCtx.message?.text ?? "";
			const typeCallback = typeCtx.callbackQuery?.data;

			if (typeCallback === "flow:cancel" || isCancelCommand(typeText)) {
				if (typeCtx.callbackQuery) {
					try {
						await typeCtx.answerCallbackQuery();
					} catch {}
				}
				await typeCtx.reply("❌ عملیات افزودن خدمت جدید لغو شد.");
				return;
			}

			const matchType = typeCallback?.match(
				/^catalog:type:(STATIC_DELIVERY|DIRECT_ACCOUNT|IDENTITY_HANDLE|CONFIG_VPN)$/,
			);
			if (matchType && matchType[1]) {
				if (typeCtx.callbackQuery) {
					try {
						await typeCtx.answerCallbackQuery();
					} catch {}
				}
				catalogType = matchType[1] as CatalogType;
				break;
			}

			const trimmed = typeText.trim().toUpperCase();
			if (
				trimmed === "STATIC_DELIVERY" ||
				trimmed === "DIRECT_ACCOUNT" ||
				trimmed === "IDENTITY_HANDLE" ||
				trimmed === "CONFIG_VPN"
			) {
				catalogType = trimmed as CatalogType;
				break;
			}

			await typeCtx.reply("❌ نوع خدمت نامعتبر است. لطفاً یکی از گزینه‌های زیر را انتخاب کنید:", {
				reply_markup: getCatalogTypeSelectionKeyboard(),
			});
		}

		// Step 4: Prompt FulfillmentStrategy (auto-suggest default with option to override)
		const suggestedStrategy = DEFAULT_CATALOG_STRATEGY[catalogType];
		await ctx.reply(
			`⚙️ نحوه تحویل و انجام سفارش (استراتژی):\n\n` +
				`پیشنهاد خودکار برای این نوع خدمت: *${FULFILLMENT_STRATEGY_LABELS[suggestedStrategy]}*\n\n` +
				`می‌توانید استراتژی پیشنهادی را تایید کنید یا استراتژی دیگری انتخاب نمایید:`,
			{
				parse_mode: "Markdown",
				reply_markup: getCatalogStrategySelectionKeyboard(suggestedStrategy),
			},
		);

		let fulfillmentStrategy: FulfillmentStrategy;
		while (true) {
			const stratCtx = await conversation.wait();
			const stratText = stratCtx.message?.text ?? "";
			const stratCallback = stratCtx.callbackQuery?.data;

			if (stratCallback === "flow:cancel" || isCancelCommand(stratText)) {
				if (stratCtx.callbackQuery) {
					try {
						await stratCtx.answerCallbackQuery();
					} catch {}
				}
				await stratCtx.reply("❌ عملیات افزودن خدمت جدید لغو شد.");
				return;
			}

			if (stratCallback === "catalog:strategy:confirm_default" || isConfirmCommand(stratText)) {
				if (stratCtx.callbackQuery) {
					try {
						await stratCtx.answerCallbackQuery();
					} catch {}
				}
				fulfillmentStrategy = suggestedStrategy;
				break;
			}

			const overrideMatch = stratCallback?.match(
				/^catalog:strategy:(?:override:)?(PAYLOAD_DELIVERY|ACTIVATION|AUTOMATED_PANEL)$/,
			);
			if (overrideMatch && overrideMatch[1]) {
				if (stratCtx.callbackQuery) {
					try {
						await stratCtx.answerCallbackQuery();
					} catch {}
				}
				fulfillmentStrategy = overrideMatch[1] as FulfillmentStrategy;
				break;
			}

			const stratUpper = stratText.trim().toUpperCase();
			if (stratUpper === "PAYLOAD_DELIVERY" || stratUpper === "ACTIVATION" || stratUpper === "AUTOMATED_PANEL") {
				fulfillmentStrategy = stratUpper as FulfillmentStrategy;
				break;
			}

			await stratCtx.reply("❌ لطفاً استراتژی پیشنهادی را تایید کنید یا یکی از گزینه‌های موجود را انتخاب کنید:", {
				reply_markup: getCatalogStrategySelectionKeyboard(suggestedStrategy),
			});
		}

		// Step 5: If CONFIG_VPN, prompt server region presets or custom regions
		let requirementConfig: Record<string, unknown> | null = null;
		if (catalogType === "CONFIG_VPN") {
			await ctx.reply(
				`🌐 انتخاب مناطق سرور مجاز (VPN)\n\n` +
					`لطفاً یکی از پیش‌فرض‌های زیر را انتخاب کنید یا کدهای مناطق مورد نظر را تایپ و ارسال نمایید (مثال: de, nl, fi):`,
				{
					reply_markup: getVpnRegionPresetsKeyboard(),
				},
			);

			while (true) {
				const regionCtx = await conversation.wait();
				const regionText = regionCtx.message?.text ?? "";
				const regionCallback = regionCtx.callbackQuery?.data;

				if (regionCallback === "flow:cancel" || isCancelCommand(regionText)) {
					if (regionCtx.callbackQuery) {
						try {
							await regionCtx.answerCallbackQuery();
						} catch {}
					}
					await regionCtx.reply("❌ عملیات افزودن خدمت جدید لغو شد.");
					return;
				}

				const presetMatch = regionCallback?.match(/^catalog:region:preset:(.+)$/);
				if (presetMatch && presetMatch[1]) {
					if (regionCtx.callbackQuery) {
						try {
							await regionCtx.answerCallbackQuery();
						} catch {}
					}
					const foundPreset = VPN_REGION_PRESETS.find((p) => p.code === presetMatch[1]);
					const allowedRegions = foundPreset ? foundPreset.regions : [presetMatch[1]];
					requirementConfig = { allowedRegions };
					break;
				}

				if (regionText.trim().length > 0) {
					const rawTokens = regionText
						.split(/[,\s]+/)
						.map((t) => t.trim().toLowerCase())
						.filter(Boolean);
					if (rawTokens.length > 0) {
						requirementConfig = { allowedRegions: rawTokens };
						break;
					}
				}

				await regionCtx.reply("❌ لطفاً یک پیش‌فرض را انتخاب کنید یا کدهای مناطق را به صورت متن ارسال نمایید:", {
					reply_markup: getVpnRegionPresetsKeyboard(),
				});
			}
		}

		// Step 6: Prompt USD Price
		await ctx.reply("لطفاً قیمت خدمت به دلار ($) را وارد کنید (مثال: 15.00):", {
			reply_markup: new InlineKeyboard().text("❌ انصراف", "flow:cancel"),
		});

		let usdPrice = "";
		while (true) {
			const priceCtx = await conversation.wait();
			const priceText = priceCtx.message?.text ?? "";
			const priceCallback = priceCtx.callbackQuery?.data;

			if (priceCallback === "flow:cancel" || isCancelCommand(priceText)) {
				if (priceCtx.callbackQuery) {
					try {
						await priceCtx.answerCallbackQuery();
					} catch {}
				}
				await priceCtx.reply("❌ عملیات افزودن خدمت جدید لغو شد.");
				return;
			}

			const parsedPrice = parseUsdInput(priceText);
			if (parsedPrice !== null) {
				usdPrice = parsedPrice;
				break;
			}

			await priceCtx.reply("❌ قیمت وارد شده نامعتبر است. لطفاً یک عدد مثبت به دلار وارد کنید (مثال: 15.00):", {
				reply_markup: new InlineKeyboard().text("❌ انصراف", "flow:cancel"),
			});
		}

		// Step 7: Confirmation (with inline buttons)
		const descLine = description ? `\n📝 توضیحات: ${description}` : "\n📝 توضیحات: ندارد";
		const typeLine = `\n🗂 نوع خدمت: ${CATALOG_TYPE_LABELS[catalogType]}`;
		const stratLine = `\n⚙️ نحوه تحویل: ${FULFILLMENT_STRATEGY_LABELS[fulfillmentStrategy]}`;
		const regionsLine = formatRequirementRegions(requirementConfig);

		await ctx.reply(
			`📋 پیش‌نمایش خدمت جدید:\n\n` +
				`🏷 نام: ${name}` +
				descLine +
				typeLine +
				stratLine +
				regionsLine +
				`\n💰 قیمت: $${usdPrice}\n\n` +
				`آیا اطلاعات فوق را تایید می‌کنید؟`,
			{
				reply_markup: getConfirmationInlineKeyboard(),
			},
		);

		const confirmCtx = await conversation.wait();
		const confirmText = confirmCtx.message?.text ?? "";
		const confirmCallback = confirmCtx.callbackQuery?.data;

		if (
			confirmCallback === "flow:cancel" ||
			isCancelCommand(confirmText) ||
			(confirmCallback !== "flow:confirm" && !isConfirmCommand(confirmText))
		) {
			if (confirmCtx.callbackQuery) {
				try {
					await confirmCtx.answerCallbackQuery();
				} catch {}
			}
			await confirmCtx.reply("❌ عملیات افزودن خدمت جدید لغو شد.");
			return;
		}

		if (confirmCtx.callbackQuery) {
			try {
				await confirmCtx.answerCallbackQuery();
			} catch {}
		}

		// Step 8: Save & Refresh
		const createdItem = await conversation.external(async () => {
			const item = await catalogService.createCatalogItem({
				name,
				description,
				usdPrice,
				catalogType,
				fulfillmentStrategy,
				requirementConfig,
			});
			return {
				id: item.id,
				name: item.name,
				description: item.description,
				usdPrice: item.usdPrice,
				isActive: item.isActive,
				catalogType: item.catalogType,
				fulfillmentStrategy: item.fulfillmentStrategy,
				requirementConfig: item.requirementConfig,
			};
		});

		await confirmCtx.reply(
			`✅ خدمت «${createdItem.name}» با موفقیت ایجاد شد!\n\n` +
				`نوع: ${CATALOG_TYPE_LABELS[createdItem.catalogType]}\n` +
				`استراتژی: ${FULFILLMENT_STRATEGY_LABELS[createdItem.fulfillmentStrategy]}\n` +
				`قیمت: $${createdItem.usdPrice}`,
		);

		await refreshAndSendDashboard(conversation, catalogService, confirmCtx);
	};
}

/**
 * Creates the grammY conversation for Admin editing an existing Catalog Item.
 * Flow: prompt each field in sequence (pre-filled with current value), allow [Keep] to skip unchanged fields, update & refresh dashboard.
 */
export function createEditCatalogItemConversation(catalogService: CatalogService) {
	return async function editCatalogItem(conversation: EditCatalogItemConversation, ctx: Context): Promise<void> {
		const callbackData = ctx.callbackQuery?.data;
		const match = callbackData?.match(/^catalog:edit:(.+)$/);

		if (ctx.callbackQuery) {
			try {
				await ctx.answerCallbackQuery();
			} catch {}
		}

		if (!match || !match[1]) {
			await ctx.reply("⚠️ شناسه خدمت نامعتبر است.");
			return;
		}

		const itemId = match[1];

		const currentItem = await conversation.external(async () => {
			const item = await catalogService.findById(itemId);
			if (!item) {
				return null;
			}
			return {
				id: item.id,
				name: item.name,
				description: item.description,
				usdPrice: item.usdPrice,
				isActive: item.isActive,
			};
		});

		if (!currentItem) {
			await ctx.reply("⚠️ خدمت مورد نظر در سیستم یافت نشد.");
			return;
		}

		// Step 1: Edit Name (with [Keep] button)
		await ctx.reply(
			`✏️ ویرایش خدمت «${currentItem.name}»\n\n` +
				`نام فعلی: ${currentItem.name}\n` +
				`لطفاً نام جدید را وارد کنید (یا دکمه [حفظ مقدار فعلی] را بزنید):`,
			{
				reply_markup: getKeepInlineKeyboard(),
			},
		);

		let newName: string | undefined;
		while (true) {
			const nameCtx = await conversation.wait();
			const text = nameCtx.message?.text ?? "";
			const cb = nameCtx.callbackQuery?.data;

			if (cb === "flow:cancel" || isCancelCommand(text)) {
				if (nameCtx.callbackQuery) {
					try {
						await nameCtx.answerCallbackQuery();
					} catch {}
				}
				await nameCtx.reply("❌ عملیات ویرایش خدمت لغو شد.");
				return;
			}

			if (cb === "flow:keep" || isKeepCommand(text)) {
				if (nameCtx.callbackQuery) {
					try {
						await nameCtx.answerCallbackQuery();
					} catch {}
				}
				newName = undefined; // Keep current
				break;
			}

			if (text.trim().length > 0) {
				newName = text.trim();
				break;
			}

			await nameCtx.reply(
				"❌ نام خدمت نمی‌تواند خالی باشد. لطفاً نام جدید را وارد کنید (یا دکمه [حفظ مقدار فعلی] را بزنید):",
				{
					reply_markup: getKeepInlineKeyboard(),
				},
			);
		}

		// Step 2: Edit Description (with [Keep] and [Skip] buttons)
		const currentDesc = currentItem.description ?? "ندارد";
		await ctx.reply(
			`توضیحات فعلی: ${currentDesc}\n` + `لطفاً توضیحات جدید را وارد کنید (یا از دکمه‌های زیر استفاده کنید):`,
			{
				reply_markup: getKeepInlineKeyboard(true),
			},
		);

		const descCtx = await conversation.wait();
		const descText = descCtx.message?.text ?? "";
		const descCb = descCtx.callbackQuery?.data;

		if (descCb === "flow:cancel" || isCancelCommand(descText)) {
			if (descCtx.callbackQuery) {
				try {
					await descCtx.answerCallbackQuery();
				} catch {}
			}
			await descCtx.reply("❌ عملیات ویرایش خدمت لغو شد.");
			return;
		}

		let newDescription: string | null | undefined;
		if (descCb === "flow:keep" || isKeepCommand(descText)) {
			if (descCtx.callbackQuery) {
				try {
					await descCtx.answerCallbackQuery();
				} catch {}
			}
			newDescription = undefined; // Keep current
		} else if (descCb === "flow:skip" || isSkipCommand(descText)) {
			if (descCtx.callbackQuery) {
				try {
					await descCtx.answerCallbackQuery();
				} catch {}
			}
			newDescription = null; // Clear description
		} else {
			newDescription = descText.trim() || null;
		}

		// Step 3: Edit USD Price (with [Keep] button)
		await ctx.reply(
			`قیمت فعلی: $${currentItem.usdPrice}\n` +
				`لطفاً قیمت جدید را به دلار ($) وارد کنید (یا دکمه [حفظ مقدار فعلی] را بزنید):`,
			{
				reply_markup: getKeepInlineKeyboard(),
			},
		);

		let newPrice: string | undefined;
		while (true) {
			const priceCtx = await conversation.wait();
			const priceText = priceCtx.message?.text ?? "";
			const priceCb = priceCtx.callbackQuery?.data;

			if (priceCb === "flow:cancel" || isCancelCommand(priceText)) {
				if (priceCtx.callbackQuery) {
					try {
						await priceCtx.answerCallbackQuery();
					} catch {}
				}
				await priceCtx.reply("❌ عملیات ویرایش خدمت لغو شد.");
				return;
			}

			if (priceCb === "flow:keep" || isKeepCommand(priceText)) {
				if (priceCtx.callbackQuery) {
					try {
						await priceCtx.answerCallbackQuery();
					} catch {}
				}
				newPrice = undefined; // Keep current
				break;
			}

			const parsedPrice = parseUsdInput(priceText);
			if (parsedPrice !== null) {
				newPrice = parsedPrice;
				break;
			}

			await priceCtx.reply(
				"❌ قیمت وارد شده نامعتبر است. لطفاً یک عدد مثبت به دلار وارد کنید (یا دکمه [حفظ مقدار فعلی] را بزنید):",
				{
					reply_markup: getKeepInlineKeyboard(),
				},
			);
		}

		// Step 4: Execute update
		const updated = await conversation.external(async () => {
			const item = await catalogService.editCatalogItem(itemId, {
				name: newName,
				description: newDescription,
				usdPrice: newPrice,
			});
			return {
				id: item.id,
				name: item.name,
				description: item.description,
				usdPrice: item.usdPrice,
				isActive: item.isActive,
			};
		});

		await ctx.reply(`✅ خدمت «${updated.name}» با موفقیت به‌روزرسانی شد!\n\nقیمت: $${updated.usdPrice}`);

		await refreshAndSendDashboard(conversation, catalogService, ctx);
	};
}
