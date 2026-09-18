import { UsdAmount } from "@/core/shared/money.vo";

export type CatalogType = "STATIC_DELIVERY" | "DIRECT_ACCOUNT" | "IDENTITY_HANDLE" | "CONFIG_VPN";
export type FulfillmentStrategy = "PAYLOAD_DELIVERY" | "ACTIVATION" | "AUTOMATED_PANEL";

export const DEFAULT_CATALOG_STRATEGY: Record<CatalogType, FulfillmentStrategy> = {
	STATIC_DELIVERY: "PAYLOAD_DELIVERY",
	DIRECT_ACCOUNT: "ACTIVATION",
	IDENTITY_HANDLE: "ACTIVATION",
	CONFIG_VPN: "PAYLOAD_DELIVERY",
};

export interface VpnRequirementConfig {
	allowedRegions: string[];
}

export interface CatalogItemProps {
	id: string;
	name: string;
	description: string | null;
	usdPrice: string | UsdAmount;
	isActive: boolean;
	catalogType?: CatalogType | undefined;
	fulfillmentStrategy?: FulfillmentStrategy | undefined;
	requirementConfig?: Record<string, unknown> | null | undefined;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * CatalogItem Domain Entity.
 * Represents an Admin-configured purchasable item with a fixed USD price and optional description.
 */
export class CatalogItem {
	public readonly id: string;
	public readonly name: string;
	public readonly description: string | null;
	private readonly _usdPrice: UsdAmount;
	public readonly isActive: boolean;
	public readonly catalogType: CatalogType;
	public readonly fulfillmentStrategy: FulfillmentStrategy;
	public readonly requirementConfig: Record<string, unknown> | null;
	public readonly createdAt: Date;
	public readonly updatedAt: Date;

	constructor(props: CatalogItemProps) {
		this.id = props.id;
		this.name = props.name;
		this.description = props.description;
		this._usdPrice = props.usdPrice instanceof UsdAmount ? props.usdPrice : new UsdAmount(props.usdPrice);
		this.isActive = props.isActive;
		this.catalogType = props.catalogType ?? "STATIC_DELIVERY";
		this.fulfillmentStrategy = props.fulfillmentStrategy ?? "PAYLOAD_DELIVERY";
		this.requirementConfig = props.requirementConfig ?? null;
		this.createdAt = props.createdAt;
		this.updatedAt = props.updatedAt;
	}

	public get usdPrice(): string {
		return this._usdPrice.toFixed(2);
	}

	public get usdAmountVo(): UsdAmount {
		return this._usdPrice;
	}
}
