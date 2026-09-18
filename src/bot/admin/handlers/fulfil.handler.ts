import { InlineKeyboard } from "grammy";
import type { BotContext } from "@/bot/context";
import type { OrderService } from "@/modules/order/order.service";
import type { Order } from "@/modules/order/order.entity";
import { isValidUuid, formatUserDisplayName } from "@/core/shared/telegram.utils";
import { getFulfillmentStrategy, formatActivationPromptMessage } from "@/bot/admin/fulfillment-strategy";

export { formatActivationPromptMessage };

export interface FulfilHandlerDependencies {
	orderService: OrderService;
}

/**
 * Validates that an order exists, is in PROCESSING state, and was claimed by the calling Admin.
 * Alerts the user with specific Persian copy if any assertion fails.
 */
async function getClaimedProcessingOrder(
	ctx: BotContext,
	orderId: string,
	orderService: OrderService,
	senderTelegramId: number,
): Promise<Order | null> {
	if (!isValidUuid(orderId)) {
		await ctx.answerCallbackQuery({
			text: "⚠️ سفارش مورد نظر یافت نشد.",
			show_alert: true,
		});
		return null;
	}

	const order = await orderService.findById(orderId);
	if (!order) {
		await ctx.answerCallbackQuery({
			text: "⚠️ سفارش مورد نظر یافت نشد.",
			show_alert: true,
		});
		return null;
	}

	// Reject non-claiming Admins immediately with access denied
	if (order.claimedByAdminTelegramId === null || order.claimedByAdminTelegramId !== BigInt(senderTelegramId)) {
		await ctx.answerCallbackQuery({
			text: "⛔ شما مجاز به تحویل این سفارش نیستید. این سفارش توسط ادمین دیگری دریافت شده است.",
			show_alert: true,
		});
		return null;
	}

	// Reject orders not in PROCESSING state
	if (order.status !== "PROCESSING") {
		await ctx.answerCallbackQuery({
			text: "⚠️ این سفارش دیگر در وضعیت در حال پردازش نیست یا قبلاً تکمیل شده است.",
			show_alert: true,
		});
		return null;
	}

	return order;
}

/**
 * Handles the [📦 Fulfil Order] callback query from Admins (`order:fulfil:<orderId>`).
 * Validates that the tapping Admin is the one who claimed the order and that the order is PROCESSING.
 * Dispatches to the appropriate IFulfillmentStrategy based on order.fulfillmentStrategySnapshot:
 * - ACTIVATION: displays direct confirmation prompt without starting a text conversation.
 * - PAYLOAD_DELIVERY: resets any dangling conversation and enters 3-step fulfilment conversation.
 * - AUTOMATED_PANEL: manual admin fallback enters 3-step conversation.
 */
export async function handleFulfilOrderCallback(ctx: BotContext, deps: FulfilHandlerDependencies): Promise<void> {
	const sender = ctx.from;
	if (!sender) {
		return;
	}

	const callbackData = ctx.callbackQuery?.data;
	if (!callbackData) {
		return;
	}

	const match = callbackData.match(/^order:fulfil:(.+)$/);
	if (!match || !match[1]) {
		return;
	}

	const orderId = match[1];
	const order = await getClaimedProcessingOrder(ctx, orderId, deps.orderService, sender.id);
	if (!order) {
		return;
	}

	const strategy = getFulfillmentStrategy(order.fulfillmentStrategySnapshot);
	await strategy.handleFulfil(ctx, deps, order);
}

/**
 * Handles the confirmation callback for ACTIVATION fulfillment (`order:activate:confirm:<orderId>`).
 * Enforces that only the claiming Admin can confirm fulfillment and order is an ACTIVATION order.
 * Marks the order FULFILLED without delivery_content and notifies the Buyer.
 */
export async function handleConfirmActivationCallback(
	ctx: BotContext,
	deps: FulfilHandlerDependencies,
): Promise<void> {
	const sender = ctx.from;
	if (!sender) {
		return;
	}

	const callbackData = ctx.callbackQuery?.data;
	if (!callbackData) {
		return;
	}

	const match = callbackData.match(/^order:activate:confirm:(.+)$/);
	if (!match || !match[1]) {
		return;
	}

	const orderId = match[1];
	const order = await getClaimedProcessingOrder(ctx, orderId, deps.orderService, sender.id);
	if (!order) {
		return;
	}

	if (order.fulfillmentStrategySnapshot !== "ACTIVATION") {
		await ctx.answerCallbackQuery({
			text: "⚠️ این سفارش از نوع فعال‌سازی نیست.",
			show_alert: true,
		});
		return;
	}

	const adminDisplay = formatUserDisplayName(sender);

	try {
		await deps.orderService.fulfilOrder({
			orderId,
			adminTelegramId: sender.id,
			adminUsername: adminDisplay,
		});

		if (ctx.callbackQuery) {
			try {
				await ctx.answerCallbackQuery({
					text: "✅ فعال‌سازی سفارش با موفقیت انجام شد.",
				});
			} catch {}
		}

		try {
			await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
		} catch {}

		await ctx.reply("✅ سفارش با موفقیت فعال‌سازی شد و پیام تکمیل برای خریدار ارسال گردید.");
	} catch (err: any) {
		console.error("Failed to fulfil activation order:", err);
		await ctx.answerCallbackQuery({
			text: "❌ خطایی در ثبت فعال‌سازی سفارش رخ داد.",
			show_alert: true,
		});
	}
}

/**
 * Handles the cancellation callback for ACTIVATION fulfillment (`order:activate:cancel:<orderId>`).
 * Cancels the confirmation prompt and leaves the order in PROCESSING state.
 */
export async function handleCancelActivationCallback(
	ctx: BotContext,
	deps: FulfilHandlerDependencies,
): Promise<void> {
	const sender = ctx.from;
	if (!sender) {
		return;
	}

	const callbackData = ctx.callbackQuery?.data;
	const match = callbackData?.match(/^order:activate:cancel:(.+)$/);
	if (!match || !match[1]) {
		return;
	}

	const orderId = match[1];
	const { orderService } = deps;

	if (!isValidUuid(orderId)) {
		await ctx.answerCallbackQuery({
			text: "⚠️ سفارش مورد نظر یافت نشد.",
			show_alert: true,
		});
		return;
	}

	const order = await orderService.findById(orderId);
	if (order && order.claimedByAdminTelegramId !== null && order.claimedByAdminTelegramId !== BigInt(sender.id)) {
		await ctx.answerCallbackQuery({
			text: "⛔ شما مجاز به لغو این عملیات نیستید. این سفارش توسط ادمین دیگری دریافت شده است.",
			show_alert: true,
		});
		return;
	}

	if (ctx.callbackQuery) {
		try {
			await ctx.answerCallbackQuery();
		} catch {}
	}

	try {
		await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
	} catch {}

	await ctx.reply("❌ عملیات تحویل سفارش لغو شد.");
}
