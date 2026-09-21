import type { BotContext } from "@/bot/context";
import type { FulfilHandlerDependencies } from "@/bot/admin/handlers/fulfil.handler";
import type { Order } from "@/modules/order/order.entity";
import type { IFulfillmentStrategy } from "@/bot/admin/fulfillment-strategy/fulfillment-strategy.interface";
import { FULFIL_ORDER_CONVERSATION_ID } from "@/bot/admin/conversations/fulfil.conversation";
import { getFulfilActivationConfirmationKeyboard } from "@/bot/admin/keyboards/order.keyboards";

/**
 * Formats the direct confirmation prompt message for ACTIVATION orders.
 */
export function formatActivationPromptMessage(order: {
	id: string;
	buyerInputs?: Record<string, unknown> | null;
}): string {
	const shortOrderId = order.id.slice(0, 8);
	const email = order.buyerInputs?.email ? String(order.buyerInputs.email) : null;
	const targetUsername = order.buyerInputs?.targetUsername ? String(order.buyerInputs.targetUsername) : null;

	if (email) {
		return `آیا فعال‌سازی حساب برای ایمیل ${email} انجام شده است؟`;
	}
	if (targetUsername) {
		const handle = targetUsername.startsWith("@") ? targetUsername : `@${targetUsername}`;
		return `آیا فعال‌سازی حساب برای ${handle} انجام شده است؟`;
	}
	return `آیا فعال‌سازی حساب برای سفارش #${shortOrderId} انجام شده است؟`;
}

export class ActivationFulfillmentStrategy implements IFulfillmentStrategy {
	public readonly strategy = "ACTIVATION" as const;

	public async handleFulfil(ctx: BotContext, _deps: FulfilHandlerDependencies, order: Order): Promise<void> {
		try {
			await ctx.conversation.exit(FULFIL_ORDER_CONVERSATION_ID);
		} catch {}

		if (ctx.callbackQuery) {
			try {
				await ctx.answerCallbackQuery();
			} catch {}
		}

		const promptMessage = formatActivationPromptMessage(order);
		const keyboard = getFulfilActivationConfirmationKeyboard(order.id);

		await ctx.reply(promptMessage, {
			reply_markup: keyboard,
		});
	}
}
