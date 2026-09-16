import { Composer } from "grammy";
import type { DependencyContainer } from "tsyringe";
import type { BotContext } from "@/bot/context";
import { createAdminMiddleware } from "@/bot/middleware/admin.middleware";
import { handleSetRate } from "@/bot/admin/handlers/set-rate.handler";
import { handleRate } from "@/bot/admin/handlers/rate.handler";
import { handleSetCardCommand } from "@/bot/admin/handlers/set-card.handler";
import { handleApproveCallback } from "@/bot/admin/handlers/approve.handler";
import { handleRejectCallback } from "@/bot/admin/handlers/reject.handler";
import { handlePending, handlePendingPage, handleReviewCallback } from "@/bot/admin/handlers/pending.handler";
import {
	handleCatalogCommand,
	handleCatalogToggleCallback,
	handleCatalogAddCallback,
	handleCatalogEditCallback,
	handleCatalogViewCallback,
	handleCatalogListCallback,
} from "@/bot/admin/handlers/catalog.handler";
import { handleOrdersCommand } from "@/bot/admin/handlers/orders.handler";
import { handleClaimOrderCallback } from "@/bot/admin/handlers/claim.handler";
import { handleFulfilOrderCallback } from "@/bot/admin/handlers/fulfil.handler";
import { handleRejectOrderCallback } from "@/bot/admin/handlers/order-reject.handler";
import {
	handleRateModeCommand,
	handleRateModeSwitchCallback,
	handleRateModeCancelCallback,
} from "@/bot/admin/handlers/rate-mode.handler";
import { SPREAD_CONVERSATION_ID } from "@/bot/admin/conversations/spread.conversation";
import { ExchangeRateService } from "@/modules/exchange-rate/services/exchange-rate.service";
import { ExchangeRateConfigService } from "@/modules/exchange-rate/services/exchange-rate-config.service";
import type { WallexClient } from "@/modules/wallex/wallex.client.interface";
import { BaselineRateSyncWorker } from "@/modules/exchange-rate/baseline-rate-sync.worker";
import { TOKENS } from "@/core/di/tokens";

import { TopUpService } from "@/modules/top-up/top-up.service";
import { CatalogService } from "@/modules/catalog/catalog.service";
import { OrderService } from "@/modules/order/order.service";
import { OtcPurchaseService } from "@/modules/otc-purchase/otc-purchase.service";
import { handleOtcRetryCallback } from "@/bot/admin/handlers/otc-retry.handler";

export interface AdminComposerOptions {
	container?: DependencyContainer | undefined;
	exchangeRateService?: ExchangeRateService | undefined;
	exchangeRateConfigService?: ExchangeRateConfigService | undefined;
	topUpService?: TopUpService | undefined;
	catalogService?: CatalogService | undefined;
	orderService?: OrderService | undefined;
	otcPurchaseService?: OtcPurchaseService | undefined;
	wallexClient?: WallexClient | undefined;
	syncWorker?: BaselineRateSyncWorker | undefined;
	adminIds?: string | Set<bigint> | undefined;
}

/**
 * Creates a grammY Composer that mounts and guards all Admin routes:
 * - /orders & '📋 سفارش‌های فعال'
 * - /setrate & '✏️ تنظیم نرخ ارز'
 * - /rate & '💱 نرخ ارز فعلی'
 * - /ratemode & '🔄 حالت نرخ ارز'
 * - /spread & '📊 تنظیم اسپرد'
 * - /setcard & '💳 تنظیم کارت بانکی'
 * - /pending & '⏳ درخواست‌های در انتظار'
 * - /catalog & '📦 کاتالوگ خدمات'
 * - callbackQuery ratemode:switch:<mode>
 * - callbackQuery ratemode:cancel
 * - callbackQuery pending_page:<page>
 * - callbackQuery review:<requestId>
 * - callbackQuery approve:<requestId>
 * - callbackQuery reject:<requestId>
 * - callbackQuery catalog:view:<itemId>
 * - callbackQuery catalog:list
 * - callbackQuery catalog:toggle:<itemId>
 * - callbackQuery catalog:add
 * - callbackQuery catalog:edit:<itemId>
 */
export function createAdminComposer(options?: AdminComposerOptions): Composer<BotContext> {
	const composer = new Composer<BotContext>();
	const adminAuth = createAdminMiddleware<BotContext>({
		adminIds: options?.adminIds,
	});
	const container = options?.container;

	const exchangeRateService = options?.exchangeRateService ?? container?.resolve(ExchangeRateService);
	const exchangeRateConfigService =
		options?.exchangeRateConfigService ??
		(container?.isRegistered(TOKENS.ExchangeRateConfigService) || container?.isRegistered(ExchangeRateConfigService)
			? container.resolve(ExchangeRateConfigService)
			: undefined);
	const topUpService = options?.topUpService ?? container?.resolve(TopUpService);
	const catalogService = options?.catalogService ?? container?.resolve(CatalogService);
	const orderService = options?.orderService ?? container?.resolve(OrderService);
	const otcPurchaseService =
		options?.otcPurchaseService ??
		(container?.isRegistered(TOKENS.OtcPurchaseService) || container?.isRegistered(OtcPurchaseService)
			? container.resolve(OtcPurchaseService)
			: undefined);

	let wallexClient = options?.wallexClient;
	if (!wallexClient && container && container.isRegistered(TOKENS.WallexClient)) {
		try {
			wallexClient = container.resolve<WallexClient>(TOKENS.WallexClient);
		} catch {}
	}

	let syncWorker = options?.syncWorker;
	if (!syncWorker && container) {
		if (container.isRegistered(TOKENS.BaselineRateSyncWorker)) {
			try {
				syncWorker = container.resolve<BaselineRateSyncWorker>(TOKENS.BaselineRateSyncWorker);
			} catch {}
		} else if (container.isRegistered(BaselineRateSyncWorker)) {
			try {
				syncWorker = container.resolve<BaselineRateSyncWorker>(BaselineRateSyncWorker);
			} catch {}
		}
	}

	if (!exchangeRateService || !topUpService || !catalogService) {
		throw new Error("All required services or a container must be provided to createAdminComposer");
	}

	// Admin Commands
	composer.command("catalog", async (ctx) => {
		await handleCatalogCommand(ctx, catalogService, {
			adminIds: options?.adminIds,
		});
	});

	composer.command("orders", async (ctx) => {
		if (orderService) {
			await handleOrdersCommand(ctx, orderService, {
				adminIds: options?.adminIds,
			});
		}
	});

	composer.command("setrate", adminAuth, async (ctx) => {
		await handleSetRate(ctx, exchangeRateService, exchangeRateConfigService);
	});

	composer.command("rate", adminAuth, async (ctx) => {
		await handleRate(ctx, exchangeRateService, exchangeRateConfigService);
	});

	composer.command("ratemode", adminAuth, async (ctx) => {
		if (exchangeRateConfigService) {
			await handleRateModeCommand(ctx, {
				exchangeRateConfigService,
				exchangeRateService,
				wallexClient,
				syncWorker,
			});
		}
	});

	composer.command("spread", adminAuth, async (ctx) => {
		await ctx.conversation.enter(SPREAD_CONVERSATION_ID);
	});

	composer.command("setcard", adminAuth, async (ctx) => {
		await handleSetCardCommand(ctx);
	});

	composer.command("pending", adminAuth, async (ctx) => {
		await handlePending(ctx, topUpService);
	});

	// Admin Menu Button Handlers (Hears)
	composer.hears(["📦 کاتالوگ خدمات", "کاتالوگ خدمات", "مدیریت خدمات", "کاتالوگ"], async (ctx) => {
		await handleCatalogCommand(ctx, catalogService, {
			adminIds: options?.adminIds,
		});
	});

	composer.hears(
		["📋 سفارش‌های فعال", "سفارش‌های فعال", "لیست سفارش‌ها", "سفارش‌ها", "صف سفارشات", "سفارشات"],
		async (ctx) => {
			if (orderService) {
				await handleOrdersCommand(ctx, orderService, {
					adminIds: options?.adminIds,
				});
			}
		},
	);

	composer.hears(["⏳ درخواست‌های در انتظار", "درخواست‌های در انتظار", "صف انتظار"], adminAuth, async (ctx) => {
		await handlePending(ctx, topUpService);
	});

	composer.hears(
		[
			"⚙️ تنظیمات نرخ ارز و حساب",
			"تنظیمات نرخ ارز و حساب",
			"تنظیمات نرخ ارز",
			"تنظیمات مالی",
			"تنظیمات حساب",
			"مدیریت نرخ ارز",
			"مدیریت حساب",
		],
		adminAuth,
		async (ctx) => {
			const { getAdminSettingsMenuKeyboard } = await import("@/bot/keyboards/menu.keyboards");
			await ctx.reply("⚙️ *تنظیمات مالی، نرخ ارز و حساب بانکی*\n\nلطفاً یکی از گزینه‌های زیر را انتخاب کنید:", {
				parse_mode: "Markdown",
				reply_markup: getAdminSettingsMenuKeyboard(),
			});
		},
	);

	composer.hears(["💳 تنظیم کارت بانکی", "تنظیم کارت بانکی", "تنظیم کارت"], adminAuth, async (ctx) => {
		await handleSetCardCommand(ctx);
	});

	composer.hears(["💱 نرخ ارز فعلی", "نرخ ارز فعلی", "نرخ ارز"], adminAuth, async (ctx) => {
		await handleRate(ctx, exchangeRateService, exchangeRateConfigService);
	});

	composer.hears(["✏️ تنظیم نرخ ارز", "تنظیم نرخ ارز"], adminAuth, async (ctx) => {
		await handleSetRate(ctx, exchangeRateService, exchangeRateConfigService);
	});

	composer.hears(["🔄 حالت نرخ ارز", "حالت نرخ ارز"], adminAuth, async (ctx) => {
		if (exchangeRateConfigService) {
			await handleRateModeCommand(ctx, {
				exchangeRateConfigService,
				exchangeRateService,
				wallexClient,
				syncWorker,
			});
		}
	});

	composer.hears(["📊 تنظیم اسپرد", "تنظیم اسپرد"], adminAuth, async (ctx) => {
		await ctx.conversation.enter(SPREAD_CONVERSATION_ID);
	});

	// Admin Callback Queries
	composer.callbackQuery(/^ratemode:switch:(AUTO_SYNC|MANUAL)$/, adminAuth, async (ctx) => {
		if (exchangeRateConfigService) {
			await handleRateModeSwitchCallback(ctx, {
				exchangeRateConfigService,
				exchangeRateService,
				wallexClient,
				syncWorker,
			});
		}
	});

	composer.callbackQuery("ratemode:cancel", adminAuth, async (ctx) => {
		await handleRateModeCancelCallback(ctx);
	});

	// Admin Callback Queries
	composer.callbackQuery(/^pending_page:(\d+)$/, adminAuth, async (ctx) => {
		await handlePendingPage(ctx, topUpService);
	});

	composer.callbackQuery(/^review:(.+)$/, adminAuth, async (ctx) => {
		await handleReviewCallback(ctx, topUpService);
	});

	composer.callbackQuery(/^approve:(.+)$/, adminAuth, async (ctx) => {
		await handleApproveCallback(ctx, {
			topUpService,
			otcPurchaseService,
			adminIds: options?.adminIds,
		});
	});

	composer.callbackQuery(/^otc:retry:(.+)$/, adminAuth, async (ctx) => {
		if (!otcPurchaseService) {
			await ctx.answerCallbackQuery({
				text: "⚠️ سرویس خرید OTC در دسترس نیست.",
				show_alert: true,
			});
			return;
		}
		await handleOtcRetryCallback(ctx, { otcPurchaseService });
	});

	composer.callbackQuery(/^reject:(.+)$/, adminAuth, async (ctx) => {
		await handleRejectCallback(ctx);
	});

	composer.callbackQuery(/^catalog:view:(.+)$/, adminAuth, async (ctx) => {
		await handleCatalogViewCallback(ctx, catalogService);
	});

	composer.callbackQuery("catalog:list", adminAuth, async (ctx) => {
		await handleCatalogListCallback(ctx, catalogService);
	});

	composer.callbackQuery(/^catalog:toggle:(.+)$/, adminAuth, async (ctx) => {
		await handleCatalogToggleCallback(ctx, catalogService);
	});

	composer.callbackQuery("catalog:add", adminAuth, async (ctx) => {
		await handleCatalogAddCallback(ctx);
	});

	composer.callbackQuery(/^catalog:edit:(.+)$/, adminAuth, async (ctx) => {
		await handleCatalogEditCallback(ctx);
	});

	// Order Processing, Fulfilment & Rejection Handlers (Tickets 05, 06 & 07)
	composer.callbackQuery(/^order:process:(.+)$/, adminAuth, async (ctx) => {
		if (orderService) {
			await handleClaimOrderCallback(ctx, {
				orderService,
			});
		}
	});

	composer.callbackQuery("order:noop", adminAuth, async (ctx) => {
		try {
			await ctx.answerCallbackQuery();
		} catch {}
	});

	composer.callbackQuery(/^order:fulfil:(.+)$/, adminAuth, async (ctx) => {
		if (orderService) {
			await handleFulfilOrderCallback(ctx, {
				orderService,
			});
		}
	});

	composer.callbackQuery(/^order:reject:(.+)$/, adminAuth, async (ctx) => {
		if (orderService) {
			await handleRejectOrderCallback(ctx, {
				orderService,
			});
		}
	});

	return composer;
}
