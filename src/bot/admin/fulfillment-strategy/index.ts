import type { FulfillmentStrategy } from "@/modules/catalog/catalog.entity";
import type { IFulfillmentStrategy } from "@/bot/admin/fulfillment-strategy/fulfillment-strategy.interface";
import { ActivationFulfillmentStrategy } from "@/bot/admin/fulfillment-strategy/activation.strategy";
import { PayloadDeliveryFulfillmentStrategy } from "@/bot/admin/fulfillment-strategy/payload-delivery.strategy";
import { AutomatedPanelFulfillmentStrategy } from "@/bot/admin/fulfillment-strategy/automated-panel.strategy";

export * from "@/bot/admin/fulfillment-strategy/fulfillment-strategy.interface";
export * from "@/bot/admin/fulfillment-strategy/activation.strategy";
export * from "@/bot/admin/fulfillment-strategy/payload-delivery.strategy";
export * from "@/bot/admin/fulfillment-strategy/automated-panel.strategy";

/**
 * Resolves the appropriate IFulfillmentStrategy for a given FulfillmentStrategy snapshot.
 */
export function getFulfillmentStrategy(strategy?: FulfillmentStrategy | null): IFulfillmentStrategy {
	switch (strategy) {
		case "ACTIVATION":
			return new ActivationFulfillmentStrategy();
		case "AUTOMATED_PANEL":
			return new AutomatedPanelFulfillmentStrategy();
		case "PAYLOAD_DELIVERY":
		default:
			return new PayloadDeliveryFulfillmentStrategy();
	}
}
