import type { BotContext } from "@/bot/context";
import type { FulfilHandlerDependencies } from "@/bot/admin/handlers/fulfil.handler";
import type { Order } from "@/modules/order/order.entity";
import type { IFulfillmentStrategy } from "@/bot/admin/fulfillment-strategy/fulfillment-strategy.interface";
import { PayloadDeliveryFulfillmentStrategy } from "@/bot/admin/fulfillment-strategy/payload-delivery.strategy";

/**
 * Strategy for AUTOMATED_PANEL fulfillment.
 * Establishes the architectural seam for automated background panel jobs (Marzban, Sanaei).
 * When triggered via manual admin action, falls back to manual payload delivery.
 */
export class AutomatedPanelFulfillmentStrategy implements IFulfillmentStrategy {
	public readonly strategy = "AUTOMATED_PANEL" as const;
	private readonly payloadDeliveryStrategy = new PayloadDeliveryFulfillmentStrategy();

	public async handleFulfil(ctx: BotContext, deps: FulfilHandlerDependencies, order: Order): Promise<void> {
		await this.payloadDeliveryStrategy.handleFulfil(ctx, deps, order);
	}
}
