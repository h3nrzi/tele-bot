import type { BotContext } from "@/bot/context";
import type { FulfilHandlerDependencies } from "@/bot/admin/handlers/fulfil.handler";
import type { Order } from "@/modules/order/order.entity";
import type { IFulfillmentStrategy } from "@/bot/admin/fulfillment-strategy/fulfillment-strategy.interface";
import { FULFIL_ORDER_CONVERSATION_ID } from "@/bot/admin/conversations/fulfil.conversation";

export class PayloadDeliveryFulfillmentStrategy implements IFulfillmentStrategy {
	public readonly strategy = "PAYLOAD_DELIVERY" as const;

	public async handleFulfil(ctx: BotContext, _deps: FulfilHandlerDependencies, _order: Order): Promise<void> {
		try {
			await ctx.conversation.exit(FULFIL_ORDER_CONVERSATION_ID);
		} catch {}

		await ctx.conversation.enter(FULFIL_ORDER_CONVERSATION_ID);
	}
}
