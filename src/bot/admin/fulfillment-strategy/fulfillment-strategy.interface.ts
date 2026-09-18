import type { BotContext } from "@/bot/context";
import type { FulfilHandlerDependencies } from "@/bot/admin/handlers/fulfil.handler";
import type { Order } from "@/modules/order/order.entity";
import type { FulfillmentStrategy } from "@/modules/catalog/catalog.entity";

/**
 * Strategy interface for executing order fulfillment based on fulfillment_strategy_snapshot.
 */
export interface IFulfillmentStrategy {
	readonly strategy: FulfillmentStrategy;
	handleFulfil(ctx: BotContext, deps: FulfilHandlerDependencies, order: Order): Promise<void>;
}
