import type Decimal from "decimal.js";
import type { UsdAmount } from "@/core/shared/money.vo";
import type { CatalogType, FulfillmentStrategy } from "@/modules/catalog/catalog.entity";

export interface CreateCatalogItemInput {
	name: string;
	description?: string | null | undefined;
	usdPrice: string | number | Decimal | UsdAmount;
	isActive?: boolean | undefined;
	catalogType?: CatalogType | undefined;
	fulfillmentStrategy?: FulfillmentStrategy | undefined;
	requirementConfig?: Record<string, unknown> | null | undefined;
}
