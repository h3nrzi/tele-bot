import { injectable, inject } from 'tsyringe';
import { eq, asc } from 'drizzle-orm';
import { catalogItems } from '@/modules/catalog/catalog.schema';
import { getDefaultDb, type DbClient } from '@/core/database/client';
import type { DbExecutor } from '@/core/database/types';
import { CatalogItem } from '@/modules/catalog/catalog.entity';
import type { ICatalogRepository } from '@/modules/catalog/catalog.repository.interface';
import { TOKENS } from '@/core/di/tokens';

@injectable()
export class DrizzleCatalogRepository implements ICatalogRepository<DbExecutor> {
  constructor(
    @inject(TOKENS.DbClient) private readonly defaultDb?: DbClient
  ) {}

  private getDb(executor?: DbExecutor): DbExecutor {
    return executor ?? this.defaultDb ?? getDefaultDb();
  }

  public async findById(
    id: string,
    executor?: DbExecutor
  ): Promise<CatalogItem | null> {
    const db = this.getDb(executor);
    const [row] = await db
      .select()
      .from(catalogItems)
      .where(eq(catalogItems.id, id))
      .limit(1);

    if (!row) {
      return null;
    }

    return this.mapToEntity(row);
  }

  public async listAll(executor?: DbExecutor): Promise<CatalogItem[]> {
    const db = this.getDb(executor);
    const rows = await db
      .select()
      .from(catalogItems)
      .orderBy(asc(catalogItems.createdAt));

    return rows.map((row) => this.mapToEntity(row));
  }

  public async listActive(executor?: DbExecutor): Promise<CatalogItem[]> {
    const db = this.getDb(executor);
    const rows = await db
      .select()
      .from(catalogItems)
      .where(eq(catalogItems.isActive, true))
      .orderBy(asc(catalogItems.createdAt));

    return rows.map((row) => this.mapToEntity(row));
  }

  public async insert(
    data: {
      name: string;
      description: string | null;
      usdPrice: string;
      isActive: boolean;
    },
    executor?: DbExecutor
  ): Promise<CatalogItem> {
    const db = this.getDb(executor);
    const [row] = await db
      .insert(catalogItems)
      .values({
        name: data.name,
        description: data.description,
        usdPrice: data.usdPrice,
        isActive: data.isActive,
      })
      .returning();

    if (!row) {
      throw new Error('Failed to insert catalog item');
    }

    return this.mapToEntity(row);
  }

  public async update(
    id: string,
    data: Partial<{
      name: string;
      description: string | null;
      usdPrice: string;
      isActive: boolean;
      updatedAt: Date;
    }>,
    executor?: DbExecutor
  ): Promise<CatalogItem | null> {
    const db = this.getDb(executor);
    const updateValues: Record<string, unknown> = {
      updatedAt: data.updatedAt ?? new Date(),
    };

    if (data.name !== undefined) {
      updateValues.name = data.name;
    }
    if (data.description !== undefined) {
      updateValues.description = data.description;
    }
    if (data.usdPrice !== undefined) {
      updateValues.usdPrice = data.usdPrice;
    }
    if (data.isActive !== undefined) {
      updateValues.isActive = data.isActive;
    }

    const [row] = await db
      .update(catalogItems)
      .set(updateValues)
      .where(eq(catalogItems.id, id))
      .returning();

    if (!row) {
      return null;
    }

    return this.mapToEntity(row);
  }

  private mapToEntity(row: typeof catalogItems.$inferSelect): CatalogItem {
    return new CatalogItem({
      id: row.id,
      name: row.name,
      description: row.description,
      usdPrice: row.usdPrice,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}

export const CatalogRepository = DrizzleCatalogRepository;
