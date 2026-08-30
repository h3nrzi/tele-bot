import { injectable, inject } from 'tsyringe';
import Decimal from 'decimal.js';
import type { DbClient } from '@/core/database/client';
import { getDefaultDb } from '@/core/database/client';
import type { DbExecutor } from '@/core/database/types';
import type { ICatalogRepository } from '@/modules/catalog/catalog.repository.interface';
import { CatalogItem } from '@/modules/catalog/catalog.entity';
import {
  CatalogItemNotFoundError,
  InvalidCatalogItemNameError,
  InvalidCatalogItemPriceError,
} from '@/modules/catalog/catalog.errors';
import type { CreateCatalogItemInput } from '@/modules/catalog/dtos/create-catalog-item.dto';
import type { EditCatalogItemInput } from '@/modules/catalog/dtos/edit-catalog-item.dto';
import { UsdAmount } from '@/core/shared/money.vo';
import { TOKENS } from '@/core/di/tokens';

@injectable()
export class CatalogService {
  constructor(
    @inject(TOKENS.DbClient) private readonly db?: DbClient,
    @inject(TOKENS.CatalogRepository)
    private readonly catalogRepo?: ICatalogRepository<DbExecutor>
  ) {}

  private getDb(executor?: DbExecutor): DbExecutor {
    return executor ?? this.db ?? getDefaultDb();
  }

  private getRepo(): ICatalogRepository<DbExecutor> {
    if (!this.catalogRepo) {
      throw new Error('CatalogRepository was not provided to CatalogService');
    }
    return this.catalogRepo;
  }

  /**
   * Creates a new Catalog Item with name, optional description, and fixed USD price.
   */
  public async createCatalogItem(
    input: CreateCatalogItemInput,
    executor?: DbExecutor
  ): Promise<CatalogItem> {
    const client = this.getDb(executor);
    const repo = this.getRepo();

    const name = input.name?.trim();
    if (!name) {
      throw new InvalidCatalogItemNameError('Catalog item name cannot be empty.');
    }

    const usdPriceStr = this.validateAndFormatPrice(input.usdPrice);
    const description = input.description?.trim() || null;
    const isActive = input.isActive ?? true;

    return await repo.insert(
      {
        name,
        description,
        usdPrice: usdPriceStr,
        isActive,
      },
      client
    );
  }

  /**
   * Lists all Catalog Items (active + inactive) for the Admin catalog dashboard.
   */
  public async listAll(executor?: DbExecutor): Promise<CatalogItem[]> {
    const client = this.getDb(executor);
    const repo = this.getRepo();
    return await repo.listAll(client);
  }

  /**
   * Lists active Catalog Items only (for Buyer /shop catalog browsing).
   */
  public async listActive(executor?: DbExecutor): Promise<CatalogItem[]> {
    const client = this.getDb(executor);
    const repo = this.getRepo();
    return await repo.listActive(client);
  }

  /**
   * Finds a Catalog Item by its UUID identifier.
   */
  public async findById(
    id: string,
    executor?: DbExecutor
  ): Promise<CatalogItem | null> {
    const client = this.getDb(executor);
    const repo = this.getRepo();
    return await repo.findById(id, client);
  }

  /**
   * Updates only specified fields on an existing Catalog Item.
   */
  public async editCatalogItem(
    id: string,
    input: EditCatalogItemInput,
    executor?: DbExecutor
  ): Promise<CatalogItem> {
    const client = this.getDb(executor);
    const repo = this.getRepo();

    const existing = await repo.findById(id, client);
    if (!existing) {
      throw new CatalogItemNotFoundError(`Catalog item with ID ${id} not found.`);
    }

    const updatePayload: Parameters<typeof repo.update>[1] = {};

    if (input.name !== undefined) {
      const trimmedName = input.name.trim();
      if (!trimmedName) {
        throw new InvalidCatalogItemNameError('Catalog item name cannot be empty.');
      }
      updatePayload.name = trimmedName;
    }

    if (input.description !== undefined) {
      updatePayload.description = input.description?.trim() || null;
    }

    if (input.usdPrice !== undefined) {
      updatePayload.usdPrice = this.validateAndFormatPrice(input.usdPrice);
    }

    if (input.isActive !== undefined) {
      updatePayload.isActive = input.isActive;
    }

    updatePayload.updatedAt = new Date();

    const updated = await repo.update(id, updatePayload, client);
    if (!updated) {
      throw new CatalogItemNotFoundError(`Catalog item with ID ${id} not found.`);
    }

    return updated;
  }

  /**
   * Toggles the is_active status of a Catalog Item.
   */
  public async toggleActive(
    id: string,
    executor?: DbExecutor
  ): Promise<CatalogItem> {
    const client = this.getDb(executor);
    const repo = this.getRepo();

    const existing = await repo.findById(id, client);
    if (!existing) {
      throw new CatalogItemNotFoundError(`Catalog item with ID ${id} not found.`);
    }

    const updated = await repo.update(
      id,
      {
        isActive: !existing.isActive,
        updatedAt: new Date(),
      },
      client
    );

    if (!updated) {
      throw new CatalogItemNotFoundError(`Catalog item with ID ${id} not found.`);
    }

    return updated;
  }

  /**
   * Explicitly deactivates a Catalog Item (sets is_active = false).
   */
  public async deactivate(
    id: string,
    executor?: DbExecutor
  ): Promise<CatalogItem> {
    return await this.editCatalogItem(id, { isActive: false }, executor);
  }

  /**
   * Explicitly reactivates a Catalog Item (sets is_active = true).
   */
  public async reactivate(
    id: string,
    executor?: DbExecutor
  ): Promise<CatalogItem> {
    return await this.editCatalogItem(id, { isActive: true }, executor);
  }

  private validateAndFormatPrice(
    rawPrice: string | number | Decimal | UsdAmount
  ): string {
    let dec: Decimal;
    try {
      if (rawPrice instanceof UsdAmount) {
        dec = rawPrice.toDecimal();
      } else if (rawPrice instanceof Decimal) {
        dec = rawPrice;
      } else {
        dec = new Decimal(rawPrice);
      }
    } catch {
      throw new InvalidCatalogItemPriceError('Invalid USD price format.');
    }

    if (dec.isNaN() || dec.lte(0)) {
      throw new InvalidCatalogItemPriceError('Catalog item price must be a positive USD amount.');
    }

    return dec.toFixed(2);
  }
}
