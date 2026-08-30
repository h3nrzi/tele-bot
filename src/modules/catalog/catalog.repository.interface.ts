import type { CatalogItem } from '@/modules/catalog/catalog.entity';

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
    },
    executor?: TExecutor
  ): Promise<CatalogItem>;
  update(
    id: string,
    data: Partial<{
      name: string;
      description: string | null;
      usdPrice: string;
      isActive: boolean;
      updatedAt: Date;
    }>,
    executor?: TExecutor
  ): Promise<CatalogItem | null>;
}
