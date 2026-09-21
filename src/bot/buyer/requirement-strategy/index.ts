import type { CatalogType } from "@/modules/catalog/catalog.entity";
import type { IBuyerRequirementStrategy } from "@/bot/buyer/requirement-strategy/requirement-strategy.interface";
import { DirectAccountRequirementStrategy } from "@/bot/buyer/requirement-strategy/direct-account.strategy";
import { IdentityHandleRequirementStrategy } from "@/bot/buyer/requirement-strategy/identity-handle.strategy";
import { ConfigVpnRequirementStrategy } from "@/bot/buyer/requirement-strategy/config-vpn.strategy";
import { StaticDeliveryRequirementStrategy } from "@/bot/buyer/requirement-strategy/static-delivery.strategy";

export * from "@/bot/buyer/requirement-strategy/requirement-strategy.interface";
export * from "@/bot/buyer/requirement-strategy/direct-account.strategy";
export * from "@/bot/buyer/requirement-strategy/identity-handle.strategy";
export * from "@/bot/buyer/requirement-strategy/config-vpn.strategy";
export * from "@/bot/buyer/requirement-strategy/static-delivery.strategy";

/**
 * Resolves the appropriate IBuyerRequirementStrategy for a given CatalogType.
 */
export function getBuyerRequirementStrategy(catalogType?: CatalogType | null): IBuyerRequirementStrategy {
	switch (catalogType) {
		case "DIRECT_ACCOUNT":
			return new DirectAccountRequirementStrategy();
		case "IDENTITY_HANDLE":
			return new IdentityHandleRequirementStrategy();
		case "CONFIG_VPN":
			return new ConfigVpnRequirementStrategy();
		case "STATIC_DELIVERY":
		default:
			return new StaticDeliveryRequirementStrategy();
	}
}
