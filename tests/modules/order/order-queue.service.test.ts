import { describe, it, expect } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import {
  createTestBuyer,
  createTestCatalogItem,
  placeTestOrder,
  claimTestOrder,
} from '@tests/helpers/fixtures';
import { OrderService } from '@/modules/order/order.service';
import { orders } from '@/modules/order/order.schema';
import { wallets } from '@/modules/wallet/wallet.schema';
import { eq } from 'drizzle-orm';

describe('Admin Order Queue Service (Ticket 09)', () => {
  const { db, container } = setupTestDatabase();

  it('returns empty array when there are no active orders', async () => {
    const orderService = container.resolve(OrderService);
    const queue = await orderService.getAdminOrderQueue();
    expect(queue).toEqual([]);
  });

  it('returns active orders (PLACED and PROCESSING) and excludes terminal orders (FULFILLED, REJECTED, CANCELLED)', async () => {
    const { buyer: buyer1, wallet: wallet1 } = await createTestBuyer(container, {
      telegramChatId: 10001,
      telegramUsername: 'buyer_one',
    });

    const { buyer: buyer2, wallet: wallet2 } = await createTestBuyer(container, {
      telegramChatId: 10002,
      telegramUsername: 'buyer_two',
    });

    const { buyer: buyer3, wallet: wallet3 } = await createTestBuyer(container, {
      telegramChatId: 10003,
      telegramUsername: null, // Buyer without username
    });

    // Fund wallets
    await db
      .update(wallets)
      .set({ availableBalance: '200.00' })
      .where(eq(wallets.id, wallet1.id));
    await db
      .update(wallets)
      .set({ availableBalance: '200.00' })
      .where(eq(wallets.id, wallet2.id));
    await db
      .update(wallets)
      .set({ availableBalance: '200.00' })
      .where(eq(wallets.id, wallet3.id));

    const itemA = await createTestCatalogItem(container, {
      name: 'Item A',
      usdPrice: '10.00',
      isActive: true,
    });

    const itemB = await createTestCatalogItem(container, {
      name: 'Item B',
      usdPrice: '25.00',
      isActive: true,
    });

    const itemC = await createTestCatalogItem(container, {
      name: 'Item C',
      usdPrice: '50.00',
      isActive: true,
    });

    // 1. Order 1: PLACED
    const { order: orderPlaced } = await placeTestOrder(container, {
      userId: buyer1.id,
      catalogItemId: itemA.id,
    });

    // 2. Order 2: PROCESSING (claimed by admin 999)
    const { order: orderProcessing } = await placeTestOrder(container, {
      userId: buyer2.id,
      catalogItemId: itemB.id,
    });
    await claimTestOrder(container, {
      orderId: orderProcessing.id,
      adminTelegramId: 999n,
      adminUsername: 'admin_master',
    });

    // 3. Order 3: FULFILLED (terminal)
    const { order: orderFulfilled } = await placeTestOrder(container, {
      userId: buyer1.id,
      catalogItemId: itemC.id,
    });
    await db
      .update(orders)
      .set({
        status: 'FULFILLED',
        deliveryContent: 'credentials-xyz',
        fulfilledAt: new Date(),
      })
      .where(eq(orders.id, orderFulfilled.id));

    // 4. Order 4: REJECTED (terminal)
    const { order: orderRejected } = await placeTestOrder(container, {
      userId: buyer2.id,
      catalogItemId: itemA.id,
    });
    await db
      .update(orders)
      .set({
        status: 'REJECTED',
        rejectionCategory: 'OUT_OF_STOCK',
        rejectedAt: new Date(),
      })
      .where(eq(orders.id, orderRejected.id));

    // 5. Order 5: CANCELLED (terminal)
    const { order: orderCancelled } = await placeTestOrder(container, {
      userId: buyer3.id,
      catalogItemId: itemB.id,
    });
    await db
      .update(orders)
      .set({
        status: 'CANCELLED',
        cancelledAt: new Date(),
      })
      .where(eq(orders.id, orderCancelled.id));

    // 6. Order 6: Another PLACED order from buyer without username
    const { order: orderPlaced2 } = await placeTestOrder(container, {
      userId: buyer3.id,
      catalogItemId: itemC.id,
    });

    const orderService = container.resolve(OrderService);
    const queue = await orderService.getAdminOrderQueue();

    // Assert only 3 active orders returned (PLACED, PROCESSING, PLACED2)
    expect(queue).toHaveLength(3);

    const ids = queue.map((o) => o.id);
    expect(ids).toContain(orderPlaced.id);
    expect(ids).toContain(orderProcessing.id);
    expect(ids).toContain(orderPlaced2.id);
    expect(ids).not.toContain(orderFulfilled.id);
    expect(ids).not.toContain(orderRejected.id);
    expect(ids).not.toContain(orderCancelled.id);

    // Verify PLACED item details
    const item1 = queue.find((o) => o.id === orderPlaced.id)!;
    expect(item1.status).toBe('PLACED');
    expect(item1.catalogItemName).toBe('Item A');
    expect(item1.usdPriceSnapshot).toBe('10.00');
    expect(item1.buyerTelegramChatId).toBe(10001n);
    expect(item1.buyerTelegramUsername).toBe('buyer_one');
    expect(item1.claimedByAdminTelegramId).toBeNull();
    expect(item1.claimedAt).toBeNull();

    // Verify PROCESSING item details
    const item2 = queue.find((o) => o.id === orderProcessing.id)!;
    expect(item2.status).toBe('PROCESSING');
    expect(item2.catalogItemName).toBe('Item B');
    expect(item2.usdPriceSnapshot).toBe('25.00');
    expect(item2.buyerTelegramChatId).toBe(10002n);
    expect(item2.buyerTelegramUsername).toBe('buyer_two');
    expect(item2.claimedByAdminTelegramId).toBe(999n);
    expect(item2.claimedAt).toBeInstanceOf(Date);

    // Verify Buyer without username item details
    const item3 = queue.find((o) => o.id === orderPlaced2.id)!;
    expect(item3.status).toBe('PLACED');
    expect(item3.catalogItemName).toBe('Item C');
    expect(item3.usdPriceSnapshot).toBe('50.00');
    expect(item3.buyerTelegramChatId).toBe(10003n);
    expect(item3.buyerTelegramUsername).toBeNull();
  });

  it('orders the queue in ascending chronological order (FIFO)', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: 20001,
      telegramUsername: 'fifo_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '500.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'Item X',
      usdPrice: '10.00',
      isActive: true,
    });

    const { order: first } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });

    const { order: second } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });

    const { order: third } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });

    const orderService = container.resolve(OrderService);
    const queue = await orderService.getAdminOrderQueue();

    expect(queue).toHaveLength(3);
    expect(queue[0]!.id).toBe(first.id);
    expect(queue[1]!.id).toBe(second.id);
    expect(queue[2]!.id).toBe(third.id);
  });
});
