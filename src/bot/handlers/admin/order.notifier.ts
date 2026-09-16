import type { BotContext } from "@/bot/context";
import {
	editAdminOrderNotificationMessages,
	getAdminOrderCancelledKeyboard,
	getAdminOrderFulfilledKeyboard,
	getAdminOrderNotificationKeyboard,
	getAdminOrderProcessingKeyboard,
	getAdminOrderRejectedKeyboard,
	ORDER_REJECTION_CATEGORIES,
	type OrderRejectionCategoryCode,
} from "@/bot/handlers/admin/order.keyboards";
import { resolveAdminIds } from "@/bot/middleware/admin.middleware";
import type { DbExecutor } from "@/core/database/types";
import { formatUsd } from "@/core/shared/currency.utils";
import { escapeMarkdown } from "@/core/shared/telegram.utils";
import type {
	IOrderNotifier,
	OnOrderCancelledContext,
	OnOrderClaimedContext,
	OnOrderFulfilledContext,
	OnOrderPlacedContext,
	OnOrderRejectedContext,
} from "@/modules/order/order.notifier.interface";
import type { IOrderRepository } from "@/modules/order/order.repository.interface";
import { InlineKeyboard, type Bot } from "grammy";

// Module-local notification context shapes (previously *NotificationContext in order.dto.ts)
type OrderPlacedNotificationContext = OnOrderPlacedContext;
type OrderClaimedNotificationContext = OnOrderClaimedContext;
type OrderFulfilledNotificationContext = OnOrderFulfilledContext;
type OrderRejectedNotificationContext = OnOrderRejectedContext;
type OrderCancelledNotificationContext = OnOrderCancelledContext;

export interface TelegramApiLike {
	sendMessage: (chatId: number | string, text: string, other?: Record<string, unknown>) => Promise<unknown>;
	editMessageReplyMarkup: (
		chatId: number,
		messageId: number,
		options: { reply_markup: InlineKeyboard },
	) => Promise<unknown>;
}

export interface TelegramOrderNotifierOptions {
	api: TelegramApiLike;
	adminIds?: string | Set<bigint> | undefined;
	orderRepo?: IOrderRepository<DbExecutor> | undefined;
}

export function formatAdminOrderPlacedMessage(context: {
	order: { id: string; usdPriceSnapshot: string };
	catalogItem: { name: string; description?: string | null };
	buyer: {
		telegramUsername?: string | null;
		telegramChatId: bigint | number | string;
	};
	postDebitBalance: string;
}): string {
	const buyerDisplay = context.buyer.telegramUsername
		? `@${context.buyer.telegramUsername} (شناسه: ${context.buyer.telegramChatId})`
		: `شناسه: ${context.buyer.telegramChatId}`;
	const descriptionLine = context.catalogItem.description ? `\n📝 توضیحات: ${context.catalogItem.description}` : "";

	return (
		`📦 سفارش جدید ثبت شد\n\n` +
		`🆔 شناسه سفارش: #${context.order.id}\n` +
		`👤 خریدار: ${buyerDisplay}\n` +
		`🛍️ نام خدمت: ${context.catalogItem.name}` +
		descriptionLine +
		`\n💵 مبلغ سفارش: ${formatUsd(context.order.usdPriceSnapshot)}\n` +
		`💰 موجودی باقی‌مانده خریدار: ${formatUsd(context.postDebitBalance)}`
	);
}

export function formatBuyerOrderFulfilledMessage(deliveryContent: string): string {
	return (
		`📦 سفارش شما با موفقیت تحویل داده شد!\n\n` +
		`اطلاعات تحویل سفارش:\n` +
		`${deliveryContent}\n\n` +
		`با تشکر از خرید شما.`
	);
}

export function formatBuyerOrderRejectedMessage(params: {
	orderId: string;
	rejectionCategory: string;
	rejectionNote?: string | null | undefined;
	refundAmount: string;
	updatedBalance: string;
}): string {
	const shortOrderId = params.orderId.slice(0, 8);
	const categoryInfo =
		params.rejectionCategory in ORDER_REJECTION_CATEGORIES
			? ORDER_REJECTION_CATEGORIES[params.rejectionCategory as OrderRejectionCategoryCode]
			: null;

	const categoryLabel = categoryInfo ? `${categoryInfo.label} (${categoryInfo.labelEn})` : params.rejectionCategory;

	const noteLine = params.rejectionNote ? `💬 توضیحات: ${escapeMarkdown(params.rejectionNote)}\n` : "";

	return (
		`❌ *سفارش شما رد شد*\n\n` +
		`📦 شناسه سفارش: #${shortOrderId}\n` +
		`📋 علت رد: ${categoryLabel}\n` +
		`${noteLine}` +
		`💵 مبلغ برگشت داده شده به کیف پول: ${formatUsd(params.refundAmount)}\n` +
		`💰 موجودی فعلی کیف پول شما: ${formatUsd(params.updatedBalance)}\n\n` +
		`مبلغ سفارش به موجودی کیف پول شما بازگردانده شد.`
	);
}

export function formatBuyerOrderCancelledMessage(params: {
	orderId: string;
	refundAmount: string;
	updatedBalance: string;
}): string {
	return (
		`✅ *سفارش شما با موفقیت لغو شد*\n\n` +
		`🆔 شناسه سفارش: #${params.orderId}\n` +
		`💵 مبلغ بازگشت داده شده: ${formatUsd(params.refundAmount)}\n` +
		`💰 موجودی فعلی کیف پول شما: ${formatUsd(params.updatedBalance)}\n\n` +
		`مبلغ سفارش بلافاصله به موجودی کیف پول شما بازگردانده شد.`
	);
}

export class TelegramOrderNotifier implements IOrderNotifier {
	private readonly api: TelegramApiLike;
	private readonly adminIds?: string | Set<bigint> | undefined;
	private readonly orderRepo?: IOrderRepository<DbExecutor> | undefined;

	constructor(options: TelegramOrderNotifierOptions);
	constructor(
		botOrApi: Bot<BotContext> | TelegramApiLike,
		adminIds?: string | Set<bigint> | undefined,
		orderRepo?: IOrderRepository<DbExecutor> | undefined,
	);
	constructor(
		optionsOrBotOrApi: TelegramOrderNotifierOptions | Bot<BotContext> | TelegramApiLike,
		adminIds?: string | Set<bigint> | undefined,
		orderRepo?: IOrderRepository<DbExecutor> | undefined,
	) {
		if ("api" in optionsOrBotOrApi && (optionsOrBotOrApi as any).api) {
			if ("use" in optionsOrBotOrApi) {
				// Bot<BotContext>
				this.api = (optionsOrBotOrApi as Bot<BotContext>).api;
				this.adminIds = adminIds;
				this.orderRepo = orderRepo;
			} else {
				// TelegramOrderNotifierOptions
				const opts = optionsOrBotOrApi as TelegramOrderNotifierOptions;
				this.api = opts.api;
				this.adminIds = opts.adminIds;
				this.orderRepo = opts.orderRepo;
			}
		} else if (optionsOrBotOrApi && typeof (optionsOrBotOrApi as TelegramApiLike).sendMessage === "function") {
			this.api = optionsOrBotOrApi as TelegramApiLike;
			this.adminIds = adminIds;
			this.orderRepo = orderRepo;
		} else {
			throw new Error("Invalid arguments provided to TelegramOrderNotifier constructor");
		}
	}

	public async onOrderPlaced(context: OnOrderPlacedContext): Promise<void> {
		const resolvedAdmins = resolveAdminIds(this.adminIds);
		const adminMessage = formatAdminOrderPlacedMessage(context);
		const keyboard = getAdminOrderNotificationKeyboard(context.order.id);

		const notificationPayloads: Array<{
			orderId: string;
			adminTelegramId: bigint;
			chatId: bigint;
			messageId: bigint;
		}> = [];

		for (const adminId of resolvedAdmins) {
			try {
				const sentMessage = (await this.api.sendMessage(Number(adminId), adminMessage, {
					reply_markup: keyboard,
				})) as {
					chat: { id: number | bigint | string };
					message_id: number | bigint | string;
				};

				notificationPayloads.push({
					orderId: context.order.id,
					adminTelegramId: BigInt(adminId),
					chatId: BigInt(sentMessage.chat.id),
					messageId: BigInt(sentMessage.message_id),
				});
			} catch (err) {
				console.error(`Failed to send order notification to admin ${adminId}:`, err);
			}
		}

		if (this.orderRepo && notificationPayloads.length > 0) {
			try {
				await this.orderRepo.createAdminNotifications(notificationPayloads);
			} catch (repoErr) {
				console.error(`Failed to persist admin notifications for order ${context.order.id}:`, repoErr);
			}
		}
	}

	public async onOrderClaimed(context: OnOrderClaimedContext): Promise<void> {
		const displayHandle = context.claimedByAdminUsername || String(context.claimedByAdminTelegramId);
		const processingKeyboard = getAdminOrderProcessingKeyboard(context.order.id, displayHandle);

		await editAdminOrderNotificationMessages(this.api, context.notifications, processingKeyboard);
	}

	public async onOrderFulfilled(context: OnOrderFulfilledContext): Promise<void> {
		// 1. Send delivery content to buyer
		const buyerMessage = formatBuyerOrderFulfilledMessage(context.deliveryContent);
		try {
			await this.api.sendMessage(context.buyer.telegramChatId.toString(), buyerMessage);
		} catch (sendErr) {
			console.error(
				`Failed to send fulfilment notification to buyer ${context.buyer.id} for order ${context.order.id}:`,
				sendErr,
			);
		}

		// 2. Edit admin notifications to fulfilled layout
		const adminDisplay = context.adminUsername || String(context.adminTelegramId);
		const fulfilledKeyboard = getAdminOrderFulfilledKeyboard(adminDisplay);
		await editAdminOrderNotificationMessages(this.api, context.notifications, fulfilledKeyboard);
	}

	public async onOrderRejected(context: OnOrderRejectedContext): Promise<void> {
		// 1. Send rejection message to buyer
		const buyerMessage = formatBuyerOrderRejectedMessage({
			orderId: context.order.id,
			rejectionCategory: context.rejectionCategory,
			rejectionNote: context.rejectionNote,
			refundAmount: context.refundAmount,
			updatedBalance: context.updatedBalance,
		});

		await this.sendMarkdownWithFallback(
			context.buyer.telegramChatId.toString(),
			buyerMessage,
			`buyer ${context.buyer.id}`,
			context.order.id,
		);

		// 2. Edit admin notifications to rejected layout
		const adminDisplay =
			context.adminUsername || (context.adminTelegramId ? String(context.adminTelegramId) : undefined);
		const rejectedKeyboard = getAdminOrderRejectedKeyboard(adminDisplay);
		await editAdminOrderNotificationMessages(this.api, context.notifications, rejectedKeyboard);
	}

	public async onOrderCancelled(context: OnOrderCancelledContext): Promise<void> {
		// 1. Send cancellation message to buyer
		const buyerMessage = formatBuyerOrderCancelledMessage({
			orderId: context.order.id,
			refundAmount: context.refundAmount,
			updatedBalance: context.updatedBalance,
		});

		await this.sendMarkdownWithFallback(
			context.buyer.telegramChatId.toString(),
			buyerMessage,
			`buyer ${context.buyer.id}`,
			context.order.id,
		);

		// 2. Edit admin notifications to cancelled layout
		const cancelledKeyboard = getAdminOrderCancelledKeyboard();
		await editAdminOrderNotificationMessages(this.api, context.notifications, cancelledKeyboard);
	}

	private async sendMarkdownWithFallback(
		chatId: number | string,
		messageText: string,
		recipientLabel: string,
		orderId: string,
	): Promise<void> {
		try {
			await this.api.sendMessage(chatId, messageText, {
				parse_mode: "Markdown",
			});
		} catch (sendErr: any) {
			if (sendErr?.message?.includes("can't parse entities")) {
				try {
					await this.api.sendMessage(chatId, messageText.replace(/[*_`\\]/g, ""));
				} catch (fallbackErr) {
					console.error(
						`Failed to send plain text notification to ${recipientLabel} for order ${orderId}:`,
						fallbackErr,
					);
				}
			} else {
				console.error(`Failed to send notification to ${recipientLabel} for order ${orderId}:`, sendErr);
			}
		}
	}
}
