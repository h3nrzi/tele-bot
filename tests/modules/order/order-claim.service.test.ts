import { describe, it, expect } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import {
  createTestBuyer,
  createTestCatalogItem,
  placeTestOrder,
  claimTestOrder,
} from '@tests/helpers/fixtures';
import { OrderService } from '@/modules/order/order.service';
import {
  OrderAlreadyClaimedError,
  InvalidOrderStatusError,
  OrderNotFoundError,
} from '@/modules/order/order.errors';
import { orders, orderAdminNotifications } from '@/modules/order/order.schema';
import { wallets } from '@/modules/wallet/wallet.schema';
import { eq } from 'drizzle-orm';
import type { OrderAdminNotificationPayload } from '@/modules/order/dtos/order.dto';

describe('Order Claim Service (Ticket 05)', () => {
  const { db, container } = setupTestDatabase();

  it('happy path: transitions PLACED order to PROCESSING and sets claimed_by_admin_telegram_id and claimed_at', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: 11223344,
      telegramUsername: 'test_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '50.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'Telegram Premium 3 Months',
      usdPrice: '14.99',
      isActive: true,
    });

    const { order: placedOrder } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });

    expect(placedOrder.status).toBe('PLACED');
    expect(placedOrder.claimedByAdminTelegramId).toBeNull();
    expect(placedOrder.claimedAt).toBeNull();

    const orderService = container.resolve(OrderService);
    const adminTelegramId = 99887766n;

    const result = await orderService.claimOrder({
      orderId: placedOrder.id,
      adminTelegramId,
      adminUsername: 'admin_hero',
    });

    // 1. Assert result
    expect(result.order.id).toBe(placedOrder.id);
    expect(result.order.status).toBe('PROCESSING');
    expect(result.order.claimedByAdminTelegramId).toBe(adminTelegramId);
    expect(result.order.claimedAt).toBeInstanceOf(Date);

    // 2. Assert DB state
    const [dbOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, placedOrder.id));

    expect(dbOrder).toBeDefined();
    expect(dbOrder?.status).toBe('PROCESSING');
    expect(dbOrder?.claimedByAdminTelegramId).toBe(adminTelegramId);
    expect(dbOrder?.claimedAt).toBeInstanceOf(Date);
    expect(dbOrder?.deliveryContent).toBeNull();
  });

  it('sequential double claim: second admin claim on same order returns OrderAlreadyClaimedError', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: 22334455,
      telegramUsername: 'race_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '50.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'VPN 1 Month',
      usdPrice: '5.00',
      isActive: true,
    });

    const { order: placedOrder } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });

    const orderService = container.resolve(OrderService);
    const admin1Id = 111111n;
    const admin2Id = 222222n;

    // Admin 1 claims
    const claim1Result = await orderService.claimOrder({
      orderId: placedOrder.id,
      adminTelegramId: admin1Id,
      adminUsername: 'admin1',
    });
    expect(claim1Result.order.status).toBe('PROCESSING');

    // Admin 2 attempts to claim
    await expect(
      orderService.claimOrder({
        orderId: placedOrder.id,
        adminTelegramId: admin2Id,
        adminUsername: 'admin2',
      })
    ).rejects.toThrow(OrderAlreadyClaimedError);

    // Assert order in DB is still claimed by admin 1
    const [dbOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, placedOrder.id));

    expect(dbOrder?.claimedByAdminTelegramId).toBe(admin1Id);
  });

  it('concurrent race condition: exactly one admin succeeds when claiming simultaneously', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: 33445566,
      telegramUsername: 'concurrent_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '50.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'Game Pass 1 Month',
      usdPrice: '15.00',
      isActive: true,
    });

    const { order: placedOrder } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });

    const orderService = container.resolve(OrderService);

    const [res1, res2] = await Promise.allSettled([
      orderService.claimOrder({
        orderId: placedOrder.id,
        adminTelegramId: 101n,
        adminUsername: 'admin_fast',
      }),
      orderService.claimOrder({
        orderId: placedOrder.id,
        adminTelegramId: 102n,
        adminUsername: 'admin_slow',
      }),
    ]);

    const fulfilled = [res1, res2].filter((r) => r.status === 'fulfilled');
    const rejected = [res1, res2].filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const rejectedRes = rejected[0] as PromiseRejectedResult;
    expect(rejectedRes.reason).toBeInstanceOf(OrderAlreadyClaimedError);

    // Verify DB consistency
    const [dbOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, placedOrder.id));

    expect(dbOrder?.status).toBe('PROCESSING');
    expect([101n, 102n]).toContain(dbOrder?.claimedByAdminTelegramId);
  });

  it('rejects claim on non-existent order ID', async () => {
    const orderService = container.resolve(OrderService);

    await expect(
      orderService.claimOrder({
        orderId: '00000000-0000-0000-0000-000000000000',
        adminTelegramId: 12345n,
      })
    ).rejects.toThrow(OrderNotFoundError);
  });

  it('rejects claim on orders in terminal status (FULFILLED, REJECTED, CANCELLED)', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: 44556677,
      telegramUsername: 'terminal_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '100.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'Service A',
      usdPrice: '10.00',
      isActive: true,
    });

    const orderService = container.resolve(OrderService);

    // 1. Order at FULFILLED
    const { order: order1 } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });
    await db
      .update(orders)
      .set({ status: 'FULFILLED', fulfilledAt: new Date() })
      .where(eq(orders.id, order1.id));

    await expect(
      orderService.claimOrder({
        orderId: order1.id,
        adminTelegramId: 999n,
      })
    ).rejects.toThrow(InvalidOrderStatusError);

    // 2. Order at REJECTED
    const { order: order2 } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });
    await db
      .update(orders)
      .set({
        status: 'REJECTED',
        rejectionCategory: 'OUT_OF_STOCK',
        rejectedAt: new Date(),
      })
      .where(eq(orders.id, order2.id));

    await expect(
      orderService.claimOrder({
        orderId: order2.id,
        adminTelegramId: 999n,
      })
    ).rejects.toThrow(InvalidOrderStatusError);

    // 3. Order at CANCELLED
    const { order: order3 } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });
    await db
      .update(orders)
      .set({ status: 'CANCELLED', cancelledAt: new Date() })
      .where(eq(orders.id, order3.id));

    await expect(
      orderService.claimOrder({
        orderId: order3.id,
        adminTelegramId: 999n,
      })
    ).rejects.toThrow(InvalidOrderStatusError);
  });

  it('passes context to updateAdminNotifications callback and updates admin notifications resilience', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: 55667788,
      telegramUsername: 'notif_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '50.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'Spotify 1 Year',
      usdPrice: '20.00',
      isActive: true,
    });

    const mockAdminPayloads: OrderAdminNotificationPayload[] = [
      { adminTelegramId: 1001n, chatId: 1001n, messageId: 8001n },
      { adminTelegramId: 1002n, chatId: 1002n, messageId: 8002n },
    ];

    const { order: placedOrder } = await placeTestOrder(
      container,
      {
        userId: buyer.id,
        catalogItemId: item.id,
      },
      {
        notifyAdmins: async () => mockAdminPayloads,
      }
    );

    let capturedNotificationContext: any = null;

    const claimResult = await claimTestOrder(
      container,
      {
        orderId: placedOrder.id,
        adminTelegramId: 1001n,
        adminUsername: 'superadmin',
      },
      {
        updateAdminNotifications: async (ctx) => {
          capturedNotificationContext = ctx;
        },
      }
    );

    expect(capturedNotificationContext).toBeDefined();
    expect(capturedNotificationContext.order.id).toBe(placedOrder.id);
    expect(capturedNotificationContext.order.status).toBe('PROCESSING');
    expect(capturedNotificationContext.claimedByAdminTelegramId).toBe(1001n);
    expect(capturedNotificationContext.claimedByAdminUsername).toBe('superadmin');
    expect(capturedNotificationContext.notifications).toHaveLength(2);

    expect(claimResult.adminNotifications).toHaveLength(2);
  });

  it('completes claim successfully even if updateAdminNotifications callback throws', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: 66778899,
      telegramUsername: 'error_notif_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '50.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'Netflix 4K',
      usdPrice: '15.00',
      isActive: true,
    });

    const { order: placedOrder } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });

    const claimResult = await claimTestOrder(
      container,
      {
        orderId: placedOrder.id,
        adminTelegramId: 1001n,
      },
      {
        updateAdminNotifications: async () => {
          throw new Error('Telegram API connection timeout');
        },
      }
    );

    expect(claimResult.order.status).toBe('PROCESSING');

    // DB state is still updated
    const [dbOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, placedOrder.id));

    expect(dbOrder?.status).toBe('PROCESSING');
  });
});
