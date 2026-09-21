import type { CatalogItem, CatalogType, FulfillmentStrategy } from "@/modules/catalog/catalog.entity";

/**
 * Domain Repository Interface for CatalogItem.
 */
export interface ICatalogRepository<TExecutor = unknown> {
	findById(id: string, executor?: TExecutor): Promise<CatalogItem | null>;
	listAll(executor?: TExecutor): Promise<CatalogItem[]>;
	listActive(executor?: TExecutor): Promise<CatalogItem[]>;
	insert(
		data: {
			name: string;
			description: string | null;
			usdPrice: string;
			isActive: boolean;
			catalogType?: CatalogType | undefined;
			fulfillmentStrategy?: FulfillmentStrategy | undefined;
			requirementConfig?: Record<string, unknown> | null | undefined;
		},
		executor?: TExecutor,
	): Promise<CatalogItem>;
	update(
		id: string,
		data: Partial<{
			name: string;
			description: string | null;
			usdPrice: string;
			isActive: boolean;
			catalogType: CatalogType;
			fulfillmentStrategy: FulfillmentStrategy;
			requirementConfig: Record<string, unknown> | null;
			updatedAt: Date;
		}>,
		executor?: TExecutor,
	): Promise<CatalogItem | null>;
}
