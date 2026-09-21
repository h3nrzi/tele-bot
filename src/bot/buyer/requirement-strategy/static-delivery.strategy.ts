import type {
	BuyerRequirementContext,
	IBuyerRequirementStrategy,
	RequirementCollectionOutcome,
} from "@/bot/buyer/requirement-strategy/requirement-strategy.interface";

/**
 * Requirement collection strategy for STATIC_DELIVERY items (e.g. vouchers, digital codes).
 * No buyer inputs required prior to placement; returns null inputs immediately.
 */
export class StaticDeliveryRequirementStrategy implements IBuyerRequirementStrategy {
	public async collect(_context: BuyerRequirementContext): Promise<RequirementCollectionOutcome> {
		return {
			buyerInputs: null,
			displayMetadata: {},
		};
	}
}
