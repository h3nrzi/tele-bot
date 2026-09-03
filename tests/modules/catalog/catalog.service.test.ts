import { describe, it, expect, beforeEach } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { catalogItems } from '@/modules/catalog/catalog.schema';
import { CatalogService } from '@/modules/catalog/catalog.service';
import {
  CatalogItemNotFoundError,
  InvalidCatalogItemNameError,
  InvalidCatalogItemPriceError,
} from '@/modules/catalog/catalog.errors';
import { CatalogRepository } from '@/modules/catalog/catalog.repository';
import { eq } from 'drizzle-orm';
import Decimal from 'decimal.js';

describe('Catalog Application Service', () => {
  const { db, container } = setupTestDatabase();
  let catalogService: CatalogService;

  beforeEach(() => {
    catalogService = container.resolve(CatalogService);
  });

  describe('createCatalogItem', () => {
    it('creates a new active catalog item with name, description, and usd_price', async () => {
      const item = await catalogService.createCatalogItem({
        name: 'Telegram Premium 3 Months',
        description: 'Instant activation for 3 months',
        usdPrice: '14.99',
      });

      expect(item).toBeDefined();
      expect(item.id).toBeDefined();
      expect(item.name).toBe('Telegram Premium 3 Months');
      expect(item.description).toBe('Instant activation for 3 months');
      expect(item.usdPrice).toBe('14.99');
      expect(item.isActive).toBe(true);
      expect(item.createdAt).toBeInstanceOf(Date);
      expect(item.updatedAt).toBeInstanceOf(Date);

      // Verify in DB directly
      const [inDb] = await db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.id, item.id));

      expect(inDb).toBeDefined();
      expect(inDb?.name).toBe('Telegram Premium 3 Months');
      expect(inDb?.description).toBe('Instant activation for 3 months');
      expect(inDb?.usdPrice).toBe('14.99');
      expect(inDb?.isActive).toBe(true);
    });

    it('creates a catalog item with null description when omitted or empty', async () => {
      const item1 = await catalogService.createCatalogItem({
        name: 'VPN 1 Month',
        usdPrice: '5.00',
      });
      expect(item1.description).toBeNull();

      const item2 = await catalogService.createCatalogItem({
        name: 'VPN 3 Months',
        description: '   ',
        usdPrice: 12,
      });
      expect(item2.description).toBeNull();
      expect(item2.usdPrice).toBe('12.00');
    });

    it('accepts Decimal and number types for usdPrice', async () => {
      const item = await catalogService.createCatalogItem({
        name: 'Stars 100',
        description: '100 Telegram Stars',
        usdPrice: new Decimal('2.50'),
      });

      expect(item.usdPrice).toBe('2.50');
    });

    it('throws InvalidCatalogItemNameError when name is empty or whitespace only', async () => {
      await expect(
        catalogService.createCatalogItem({
          name: '',
          usdPrice: '10.00',
        })
      ).rejects.toThrow(InvalidCatalogItemNameError);

      await expect(
        catalogService.createCatalogItem({
          name: '   ',
          usdPrice: '10.00',
        })
      ).rejects.toThrow(InvalidCatalogItemNameError);
    });

    it('throws InvalidCatalogItemPriceError when usdPrice is non-positive or invalid', async () => {
      await expect(
        catalogService.createCatalogItem({
          name: 'Free Item',
          usdPrice: '0',
        })
      ).rejects.toThrow(InvalidCatalogItemPriceError);

      await expect(
        catalogService.createCatalogItem({
          name: 'Negative Item',
          usdPrice: '-5.00',
        })
      ).rejects.toThrow(InvalidCatalogItemPriceError);

      await expect(
        catalogService.createCatalogItem({
          name: 'Invalid Price Item',
          usdPrice: 'abc',
        })
      ).rejects.toThrow(InvalidCatalogItemPriceError);
    });
  });

  describe('listAll and listActive', () => {
    it('listAll returns all catalog items including active and inactive', async () => {
      const item1 = await catalogService.createCatalogItem({
        name: 'Item 1',
        usdPrice: '10.00',
      });
      const item2 = await catalogService.createCatalogItem({
        name: 'Item 2',
        usdPrice: '20.00',
      });

      // Deactivate item2
      await catalogService.toggleActive(item2.id);

      const all = await catalogService.listAll();
      expect(all).toHaveLength(2);
      expect(all.map((i) => i.id)).toContain(item1.id);
      expect(all.map((i) => i.id)).toContain(item2.id);
    });

    it('listActive returns only active items and excludes inactive items', async () => {
      const item1 = await catalogService.createCatalogItem({
        name: 'Active Item',
        usdPrice: '10.00',
      });
      const item2 = await catalogService.createCatalogItem({
        name: 'Inactive Item',
        usdPrice: '20.00',
      });

      await catalogService.toggleActive(item2.id);

      const activeList = await catalogService.listActive();
      expect(activeList).toHaveLength(1);
      expect(activeList[0]?.id).toBe(item1.id);
      expect(activeList[0]?.name).toBe('Active Item');
    });

    it('returns empty array when no catalog items exist', async () => {
      const all = await catalogService.listAll();
      const active = await catalogService.listActive();

      expect(all).toEqual([]);
      expect(active).toEqual([]);
    });
  });

  describe('editCatalogItem', () => {
    it('updates only the specified fields and leaves unedited fields unchanged', async () => {
      const original = await catalogService.createCatalogItem({
        name: 'Original Name',
        description: 'Original Description',
        usdPrice: '15.00',
      });

      // Update name only
      const updatedNameOnly = await catalogService.editCatalogItem(original.id, {
        name: 'Updated Name',
      });
      expect(updatedNameOnly.name).toBe('Updated Name');
      expect(updatedNameOnly.description).toBe('Original Description');
      expect(updatedNameOnly.usdPrice).toBe('15.00');

      // Update price only
      const updatedPriceOnly = await catalogService.editCatalogItem(original.id, {
        usdPrice: '19.99',
      });
      expect(updatedPriceOnly.name).toBe('Updated Name');
      expect(updatedPriceOnly.description).toBe('Original Description');
      expect(updatedPriceOnly.usdPrice).toBe('19.99');

      // Update description only
      const updatedDescOnly = await catalogService.editCatalogItem(original.id, {
        description: 'New Description',
      });
      expect(updatedDescOnly.name).toBe('Updated Name');
      expect(updatedDescOnly.description).toBe('New Description');
      expect(updatedDescOnly.usdPrice).toBe('19.99');

      // Update multiple fields simultaneously
      const updatedAll = await catalogService.editCatalogItem(original.id, {
        name: 'Final Name',
        description: null,
        usdPrice: '25.00',
      });
      expect(updatedAll.name).toBe('Final Name');
      expect(updatedAll.description).toBeNull();
      expect(updatedAll.usdPrice).toBe('25.00');
    });

    it('throws CatalogItemNotFoundError when item ID does not exist', async () => {
      await expect(
        catalogService.editCatalogItem('00000000-0000-0000-0000-000000000000', {
          name: 'Non Existent',
        })
      ).rejects.toThrow(CatalogItemNotFoundError);
    });

    it('validates new name when editing name', async () => {
      const item = await catalogService.createCatalogItem({
        name: 'Valid Name',
        usdPrice: '10.00',
      });

      await expect(
        catalogService.editCatalogItem(item.id, {
          name: '   ',
        })
      ).rejects.toThrow(InvalidCatalogItemNameError);
    });

    it('validates new usdPrice when editing price', async () => {
      const item = await catalogService.createCatalogItem({
        name: 'Valid Name',
        usdPrice: '10.00',
      });

      await expect(
        catalogService.editCatalogItem(item.id, {
          usdPrice: '0',
        })
      ).rejects.toThrow(InvalidCatalogItemPriceError);

      await expect(
        catalogService.editCatalogItem(item.id, {
          usdPrice: '-10',
        })
      ).rejects.toThrow(InvalidCatalogItemPriceError);
    });
  });

  describe('toggleActive, deactivate, and reactivate', () => {
    it('deactivates an active item, hiding it from listActive', async () => {
      const item = await catalogService.createCatalogItem({
        name: 'Item to Deactivate',
        usdPrice: '10.00',
      });

      expect(item.isActive).toBe(true);

      const deactivated = await catalogService.toggleActive(item.id);
      expect(deactivated.isActive).toBe(false);

      const activeList = await catalogService.listActive();
      expect(activeList.find((i) => i.id === item.id)).toBeUndefined();

      const allList = await catalogService.listAll();
      const found = allList.find((i) => i.id === item.id);
      expect(found).toBeDefined();
      expect(found?.isActive).toBe(false);
    });

    it('reactivates a deactivated item, restoring it to listActive', async () => {
      const item = await catalogService.createCatalogItem({
        name: 'Item to Reactivate',
        usdPrice: '10.00',
      });

      await catalogService.deactivate(item.id);
      expect((await catalogService.listActive()).length).toBe(0);

      const reactivated = await catalogService.reactivate(item.id);
      expect(reactivated.isActive).toBe(true);

      const activeList = await catalogService.listActive();
      expect(activeList).toHaveLength(1);
      expect(activeList[0]?.id).toBe(item.id);
    });

    it('throws CatalogItemNotFoundError when toggling non-existent item', async () => {
      await expect(
        catalogService.toggleActive('00000000-0000-0000-0000-000000000000')
      ).rejects.toThrow(CatalogItemNotFoundError);
    });
  });

  it('supports direct service construction with repository', async () => {
    const directService = new CatalogService(db, new CatalogRepository());
    const item = await directService.createCatalogItem({
      name: 'Direct Item',
      usdPrice: '30.00',
    });
    expect(item.name).toBe('Direct Item');
  });
});
