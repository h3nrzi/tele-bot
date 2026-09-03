import { describe, it, expect } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import {
  createTestBuyer,
  createTestCatalogItem,
  placeTestOrder,
  claimTestOrder,
  fulfilTestOrder,
} from '@tests/helpers/fixtures';
import { OrderService } from '@/modules/order/order.service';
import {
  OrderNotFoundError,
  OrderNotClaimedByAdminError,
  InvalidOrderStatusError,
} from '@/modules/order/order.errors';
import { orders } from '@/modules/order/order.schema';
import { wallets } from '@/modules/wallet/wallet.schema';
import { eq } from 'drizzle-orm';
import type { OrderAdminNotificationPayload } from '@/modules/order/dtos/order.dto';

describe('Order Fulfilment Service (Ticket 06)', () => {
  const { db, container } = setupTestDatabase();

  it('happy path: claiming admin fulfils order -> delivery_content written, status transitions to FULFILLED, fulfilled_at set', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: 11223344,
      telegramUsername: 'fulfil_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '50.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'ExpressVPN 1 Month',
      usdPrice: '12.99',
      isActive: true,
    });

    const { order: placedOrder } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });

    const adminTelegramId = 99887766n;

    // Claim order
    await claimTestOrder(container, {
      orderId: placedOrder.id,
      adminTelegramId,
      adminUsername: 'lead_admin',
    });

    const orderService = container.resolve(OrderService);
    const deliveryContent = 'Server IP: 1.2.3.4\nUsername: testuser\nPassword: secretpassword';

    // Fulfil order
    const result = await orderService.fulfilOrder({
      orderId: placedOrder.id,
      adminTelegramId,
      deliveryContent,
    });

    // 1. Assert result entity
    expect(result.order.id).toBe(placedOrder.id);
    expect(result.order.status).toBe('FULFILLED');
    expect(result.order.deliveryContent).toBe(deliveryContent);
    expect(result.order.claimedByAdminTelegramId).toBe(adminTelegramId);
    expect(result.order.fulfilledAt).toBeInstanceOf(Date);
    expect(result.buyer.id).toBe(buyer.id);

    // 2. Assert DB state
    const [dbOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, placedOrder.id));

    expect(dbOrder).toBeDefined();
    expect(dbOrder?.status).toBe('FULFILLED');
    expect(dbOrder?.deliveryContent).toBe(deliveryContent);
    expect(dbOrder?.claimedByAdminTelegramId).toBe(adminTelegramId);
    expect(dbOrder?.claimedAt).toBeInstanceOf(Date);
    expect(dbOrder?.fulfilledAt).toBeInstanceOf(Date);
  });

  it('rejects fulfilment attempt by non-claiming Admin with OrderNotClaimedByAdminError', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: 22334455,
      telegramUsername: 'unauth_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '50.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'NordVPN 1 Year',
      usdPrice: '45.00',
      isActive: true,
    });

    const { order: placedOrder } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });

    const claimingAdminId = 111111n;
    const intruderAdminId = 222222n;

    // Admin 1 claims the order
    await claimTestOrder(container, {
      orderId: placedOrder.id,
      adminTelegramId: claimingAdminId,
      adminUsername: 'legit_admin',
    });

    const orderService = container.resolve(OrderService);

    // Admin 2 attempts to fulfil
    await expect(
      orderService.fulfilOrder({
        orderId: placedOrder.id,
        adminTelegramId: intruderAdminId,
        deliveryContent: 'Fake credentials',
      })
    ).rejects.toThrow(OrderNotClaimedByAdminError);

    // Assert DB state is unchanged (still PROCESSING, no delivery content)
    const [dbOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, placedOrder.id));

    expect(dbOrder?.status).toBe('PROCESSING');
    expect(dbOrder?.deliveryContent).toBeNull();
    expect(dbOrder?.fulfilledAt).toBeNull();
    expect(dbOrder?.claimedByAdminTelegramId).toBe(claimingAdminId);
  });

  it('rejects fulfilment on unclaimed order (status PLACED) with OrderNotClaimedByAdminError', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: 33445566,
      telegramUsername: 'unclaimed_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '50.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'Game Subscription',
      usdPrice: '10.00',
      isActive: true,
    });

    const { order: placedOrder } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });

    const orderService = container.resolve(OrderService);

    await expect(
      orderService.fulfilOrder({
        orderId: placedOrder.id,
        adminTelegramId: 999999n,
        deliveryContent: 'Credentials',
      })
    ).rejects.toThrow(OrderNotClaimedByAdminError);
  });

  it('rejects fulfilment on orders in terminal status (FULFILLED, REJECTED, CANCELLED) with InvalidOrderStatusError', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: 44556677,
      telegramUsername: 'terminal_status_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '100.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'Service X',
      usdPrice: '10.00',
      isActive: true,
    });

    const adminTelegramId = 555555n;
    const orderService = container.resolve(OrderService);

    // 1. Order already FULFILLED
    const { order: order1 } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });
    await db
      .update(orders)
      .set({
        status: 'FULFILLED',
        claimedByAdminTelegramId: adminTelegramId,
        fulfilledAt: new Date(),
        deliveryContent: 'Prior delivery',
      })
      .where(eq(orders.id, order1.id));

    await expect(
      orderService.fulfilOrder({
        orderId: order1.id,
        adminTelegramId,
        deliveryContent: 'Second delivery',
      })
    ).rejects.toThrow(InvalidOrderStatusError);

    // 2. Order REJECTED
    const { order: order2 } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });
    await db
      .update(orders)
      .set({
        status: 'REJECTED',
        claimedByAdminTelegramId: adminTelegramId,
        rejectionCategory: 'OUT_OF_STOCK',
        rejectedAt: new Date(),
      })
      .where(eq(orders.id, order2.id));

    await expect(
      orderService.fulfilOrder({
        orderId: order2.id,
        adminTelegramId,
        deliveryContent: 'Delivery after reject',
      })
    ).rejects.toThrow(InvalidOrderStatusError);

    // 3. Order CANCELLED
    const { order: order3 } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });
    await db
      .update(orders)
      .set({
        status: 'CANCELLED',
        claimedByAdminTelegramId: adminTelegramId,
        cancelledAt: new Date(),
      })
      .where(eq(orders.id, order3.id));

    await expect(
      orderService.fulfilOrder({
        orderId: order3.id,
        adminTelegramId,
        deliveryContent: 'Delivery after cancel',
      })
    ).rejects.toThrow(InvalidOrderStatusError);
  });

  it('rejects fulfilment on non-existent order ID with OrderNotFoundError', async () => {
    const orderService = container.resolve(OrderService);

    await expect(
      orderService.fulfilOrder({
        orderId: '00000000-0000-0000-0000-000000000000',
        adminTelegramId: 12345n,
        deliveryContent: 'Credentials',
      })
    ).rejects.toThrow(OrderNotFoundError);
  });

  it('forwards delivery content to Buyer and updates all Admin notifications via callbacks', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: 77889900,
      telegramUsername: 'callback_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '50.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'ChatGPT Plus 1 Month',
      usdPrice: '20.00',
      isActive: true,
    });

    const mockAdminPayloads: OrderAdminNotificationPayload[] = [
      { adminTelegramId: 1001n, chatId: 1001n, messageId: 9001n },
      { adminTelegramId: 1002n, chatId: 1002n, messageId: 9002n },
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

    const adminTelegramId = 1001n;

    await claimTestOrder(container, {
      orderId: placedOrder.id,
      adminTelegramId,
      adminUsername: 'pro_admin',
    });

    let capturedBuyerContext: any = null;
    let capturedAdminContext: any = null;

    const deliveryContent = 'Here is your licence key: ABC-123-XYZ';

    const result = await fulfilTestOrder(
      container,
      {
        orderId: placedOrder.id,
        adminTelegramId,
        deliveryContent,
      },
      {
        notifyBuyer: async (ctx) => {
          capturedBuyerContext = ctx;
        },
        updateAdminNotifications: async (ctx) => {
          capturedAdminContext = ctx;
        },
      }
    );

    // 1. Assert buyer notification context
    expect(capturedBuyerContext).toBeDefined();
    expect(capturedBuyerContext.order.id).toBe(placedOrder.id);
    expect(capturedBuyerContext.buyer.id).toBe(buyer.id);
    expect(capturedBuyerContext.deliveryContent).toBe(deliveryContent);

    // 2. Assert admin notification context
    expect(capturedAdminContext).toBeDefined();
    expect(capturedAdminContext.order.id).toBe(placedOrder.id);
    expect(capturedAdminContext.order.status).toBe('FULFILLED');
    expect(capturedAdminContext.deliveryContent).toBe(deliveryContent);
    expect(capturedAdminContext.adminTelegramId).toBe(adminTelegramId);
    expect(capturedAdminContext.notifications).toHaveLength(2);

    expect(result.adminNotifications).toHaveLength(2);
  });

  it('completes fulfilment successfully even if notifications throw errors (resilience)', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: 88990011,
      telegramUsername: 'resilience_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '50.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'VPN Ultra',
      usdPrice: '10.00',
      isActive: true,
    });

    const { order: placedOrder } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });

    const adminTelegramId = 1001n;

    await claimTestOrder(container, {
      orderId: placedOrder.id,
      adminTelegramId,
    });

    const deliveryContent = 'Secret token: 998877';

    const result = await fulfilTestOrder(
      container,
      {
        orderId: placedOrder.id,
        adminTelegramId,
        deliveryContent,
      },
      {
        notifyBuyer: async () => {
          throw new Error('Buyer blocked bot');
        },
        updateAdminNotifications: async () => {
          throw new Error('Telegram network outage');
        },
      }
    );

    // Assert fulfilment succeeded despite notification errors
    expect(result.order.status).toBe('FULFILLED');
    expect(result.order.deliveryContent).toBe(deliveryContent);

    const [dbOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, placedOrder.id));

    expect(dbOrder?.status).toBe('FULFILLED');
    expect(dbOrder?.deliveryContent).toBe(deliveryContent);
  });
});
