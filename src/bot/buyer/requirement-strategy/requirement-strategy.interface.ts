import type { Context } from "grammy";
import type { BotConversation } from "@/bot/context";
import type { CatalogItem } from "@/modules/catalog/catalog.entity";
import type { ICredentialCryptoService } from "@/core/crypto/credential-crypto.interface";

export interface BuyerRequirementContext {
	conversation: BotConversation;
	ctx: Context;
	catalogItem: {
		id: string;
		name: string;
		requirementConfig?: Record<string, unknown> | null | undefined;
		[key: string]: any;
	};
	cryptoService: ICredentialCryptoService;
}

export interface BuyerRequirementResult {
	buyerInputs: Record<string, unknown> | null;
	displayMetadata: Record<string, string>;
}

export type RequirementCollectionOutcome = BuyerRequirementResult | "CANCEL";

/**
 * Strategy interface for collecting, validating, and sanitizing buyer inputs before order placement.
 */
export interface IBuyerRequirementStrategy {
	collect(context: BuyerRequirementContext): Promise<RequirementCollectionOutcome>;
}
