import { describe, it, expect } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import {
  createTestBuyer,
  createTestCatalogItem,
  placeTestOrder,
  claimTestOrder,
  cancelTestOrder,
  getTestLatestOrderForBuyer,
} from '@tests/helpers/fixtures';
import { OrderService } from '@/modules/order/order.service';
import {
  OrderNotFoundError,
  InvalidOrderStatusError,
  OrderNotOwnedByBuyerError,
} from '@/modules/order/order.errors';
import { orders } from '@/modules/order/order.schema';
import { wallets } from '@/modules/wallet/wallet.schema';
import { ledgerTransactions, ledgerEntries } from '@/modules/ledger/ledger.schema';
import { eq } from 'drizzle-orm';
import type { OrderAdminNotificationPayload } from '@/modules/order/dtos/order.dto';

describe('Order Cancellation Service (Ticket 08)', () => {
  const { db, container } = setupTestDatabase();

  it('happy path from PLACED: refund ledger written, balance restored, status -> CANCELLED, cancelledAt set, reversed_by link set', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: 11223344,
      telegramUsername: 'placed_cancel_buyer',
    });

    const initialBalance = '100.00';
    await db
      .update(wallets)
      .set({ availableBalance: initialBalance })
      .where(eq(wallets.id, wallet.id));

    const itemPrice = '29.99';
    const item = await createTestCatalogItem(container, {
      name: 'Telegram Premium 1 Year',
      usdPrice: itemPrice,
      isActive: true,
    });

    // 1. Place order (balance becomes 100.00 - 29.99 = 70.01)
    const { order: placedOrder, ledgerTransaction: debitLedgerTx } =
      await placeTestOrder(container, {
        userId: buyer.id,
        catalogItemId: item.id,
      });

    expect(placedOrder.status).toBe('PLACED');
    expect(placedOrder.usdPriceSnapshot).toBe('29.99');

    const [walletAfterPlacement] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.id, wallet.id));
    expect(walletAfterPlacement?.availableBalance).toBe('70.01');

    // 2. Cancel order from PLACED
    const orderService = container.resolve(OrderService);
    const result = await orderService.cancelOrder({
      orderId: placedOrder.id,
      userId: buyer.id,
    });

    // 3. Assert Result Object
    expect(result.order.id).toBe(placedOrder.id);
    expect(result.order.status).toBe('CANCELLED');
    expect(result.order.cancelledAt).toBeInstanceOf(Date);
    expect(result.wallet.availableBalance).toBe('100.00');
    expect(result.buyer.id).toBe(buyer.id);

    // 4. Assert DB Order State
    const [dbOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, placedOrder.id));

    expect(dbOrder).toBeDefined();
    expect(dbOrder?.status).toBe('CANCELLED');
    expect(dbOrder?.cancelledAt).toBeInstanceOf(Date);

    // 5. Assert DB Wallet Balance restored
    const [dbWallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.id, wallet.id));
    expect(dbWallet?.availableBalance).toBe('100.00');

    // 6. Assert Original Debit Ledger Transaction has reversed_by_ledger_transaction_id set
    const [originalDbTx] = await db
      .select()
      .from(ledgerTransactions)
      .where(eq(ledgerTransactions.id, debitLedgerTx.id));

    expect(originalDbTx?.reversedByLedgerTransactionId).toBe(
      result.refundLedgerTransaction.id
    );

    // 7. Assert Refund Ledger Transaction & Entries
    const [refundDbTx] = await db
      .select()
      .from(ledgerTransactions)
      .where(eq(ledgerTransactions.id, result.refundLedgerTransaction.id));

    expect(refundDbTx).toBeDefined();
    expect(refundDbTx?.orderId).toBe(placedOrder.id);
    expect(refundDbTx?.reversedByLedgerTransactionId).toBeNull();

    const refundEntries = await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.ledgerTransactionId, refundDbTx!.id));

    expect(refundEntries).toHaveLength(2);

    const buyerWalletEntry = refundEntries.find(
      (e) => e.accountType === 'BUYER_WALLET'
    );
    const systemCashEntry = refundEntries.find(
      (e) => e.accountType === 'SYSTEM_CASH'
    );

    expect(buyerWalletEntry).toBeDefined();
    expect(buyerWalletEntry?.direction).toBe('CREDIT');
    expect(buyerWalletEntry?.usdAmount).toBe(itemPrice);
    expect(buyerWalletEntry?.walletId).toBe(wallet.id);

    expect(systemCashEntry).toBeDefined();
    expect(systemCashEntry?.direction).toBe('DEBIT');
    expect(systemCashEntry?.usdAmount).toBe(itemPrice);
    expect(systemCashEntry?.walletId).toBeNull();
  });

  it('cancel from PROCESSING rejected with InvalidOrderStatusError', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: 22334455,
      telegramUsername: 'proc_cancel_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '50.00' })
      .where(eq(wallets.id, wallet.id));

    const itemPrice = '15.00';
    const item = await createTestCatalogItem(container, {
      name: 'ExpressVPN 1 Month',
      usdPrice: itemPrice,
      isActive: true,
    });

    // 1. Place order (balance becomes 35.00)
    const { order: placedOrder } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });

    const adminTelegramId = 112233n;

    // 2. Claim order (status -> PROCESSING)
    await claimTestOrder(container, {
      orderId: placedOrder.id,
      adminTelegramId,
      adminUsername: 'operator_1',
    });

    const orderService = container.resolve(OrderService);

    // 3. Attempt cancel from PROCESSING -> rejected
    await expect(
      orderService.cancelOrder({
        orderId: placedOrder.id,
        userId: buyer.id,
      })
    ).rejects.toThrow(InvalidOrderStatusError);

    // Balance remains 35.00
    const [dbWallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.id, wallet.id));
    expect(dbWallet?.availableBalance).toBe('35.00');

    // Status remains PROCESSING
    const [dbOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, placedOrder.id));
    expect(dbOrder?.status).toBe('PROCESSING');
  });

  it('cancel from terminal states (FULFILLED, REJECTED, CANCELLED) rejected with InvalidOrderStatusError', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: 44556677,
      telegramUsername: 'terminal_cancel_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '100.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'Item A',
      usdPrice: '10.00',
      isActive: true,
    });

    const orderService = container.resolve(OrderService);

    // 1. Order FULFILLED
    const { order: order1 } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });
    await db
      .update(orders)
      .set({
        status: 'FULFILLED',
        fulfilledAt: new Date(),
        deliveryContent: 'credentials',
      })
      .where(eq(orders.id, order1.id));

    await expect(
      orderService.cancelOrder({
        orderId: order1.id,
        userId: buyer.id,
      })
    ).rejects.toThrow(InvalidOrderStatusError);

    // 2. Order REJECTED
    const { order: order2 } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });
    await orderService.rejectOrder({
      orderId: order2.id,
      rejectionCategory: 'OUT_OF_STOCK',
    });

    await expect(
      orderService.cancelOrder({
        orderId: order2.id,
        userId: buyer.id,
      })
    ).rejects.toThrow(InvalidOrderStatusError);

    // 3. Order already CANCELLED (second cancel)
    const { order: order3 } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });
    await orderService.cancelOrder({
      orderId: order3.id,
      userId: buyer.id,
    });

    await expect(
      orderService.cancelOrder({
        orderId: order3.id,
        userId: buyer.id,
      })
    ).rejects.toThrow(InvalidOrderStatusError);
  });

  it('non-owner Buyer cancel rejected with OrderNotOwnedByBuyerError', async () => {
    const { buyer: ownerBuyer, wallet: ownerWallet } = await createTestBuyer(container, {
      telegramChatId: 55667788,
      telegramUsername: 'owner_buyer',
    });
    const { buyer: otherBuyer } = await createTestBuyer(container, {
      telegramChatId: 99887766,
      telegramUsername: 'other_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '50.00' })
      .where(eq(wallets.id, ownerWallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'Item Owner Test',
      usdPrice: '10.00',
      isActive: true,
    });

    const { order: placedOrder } = await placeTestOrder(container, {
      userId: ownerBuyer.id,
      catalogItemId: item.id,
    });

    const orderService = container.resolve(OrderService);

    // otherBuyer tries to cancel ownerBuyer's order
    await expect(
      orderService.cancelOrder({
        orderId: placedOrder.id,
        userId: otherBuyer.id,
      })
    ).rejects.toThrow(OrderNotOwnedByBuyerError);

    // Using telegramChatId of other buyer
    await expect(
      orderService.cancelOrder({
        orderId: placedOrder.id,
        telegramChatId: 99887766,
      })
    ).rejects.toThrow(OrderNotOwnedByBuyerError);
  });

  it('cancel non-existent order rejected with OrderNotFoundError', async () => {
    const { buyer } = await createTestBuyer(container, {
      telegramChatId: 66778899,
      telegramUsername: 'notfound_buyer',
    });

    const orderService = container.resolve(OrderService);

    await expect(
      orderService.cancelOrder({
        orderId: '00000000-0000-0000-0000-000000000000',
        userId: buyer.id,
      })
    ).rejects.toThrow(OrderNotFoundError);
  });

  it('notifies Buyer and updates all Admin notifications via callbacks', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: 77889900,
      telegramUsername: 'callback_cancel_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '50.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'NordVPN 1 Month',
      usdPrice: '10.00',
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

    let capturedBuyerContext: any = null;
    let capturedAdminContext: any = null;

    const result = await cancelTestOrder(
      container,
      {
        orderId: placedOrder.id,
        userId: buyer.id,
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
    expect(capturedBuyerContext.refundAmount).toBe('10.00');
    expect(capturedBuyerContext.updatedBalance).toBe('50.00');

    // 2. Assert admin notification context
    expect(capturedAdminContext).toBeDefined();
    expect(capturedAdminContext.order.id).toBe(placedOrder.id);
    expect(capturedAdminContext.order.status).toBe('CANCELLED');
    expect(capturedAdminContext.refundAmount).toBe('10.00');
    expect(capturedAdminContext.updatedBalance).toBe('50.00');
    expect(capturedAdminContext.notifications).toHaveLength(2);

    expect(result.adminNotifications).toHaveLength(2);
  });

  it('completes cancellation successfully even if notification callbacks throw errors (resilience)', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: 88990011,
      telegramUsername: 'resilience_cancel_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '50.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'Service Z',
      usdPrice: '12.00',
      isActive: true,
    });

    const { order: placedOrder } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });

    const result = await cancelTestOrder(
      container,
      {
        orderId: placedOrder.id,
        userId: buyer.id,
      },
      {
        notifyBuyer: async () => {
          throw new Error('Buyer blocked bot');
        },
        updateAdminNotifications: async () => {
          throw new Error('Telegram network error');
        },
      }
    );

    // Cancellation still committed
    expect(result.order.status).toBe('CANCELLED');
    expect(result.wallet.availableBalance).toBe('50.00');

    const [dbOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, placedOrder.id));
    expect(dbOrder?.status).toBe('CANCELLED');
  });

  it('buyer order status service returns most recent Order regardless of status along with Catalog Item', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: 99112233,
      telegramUsername: 'status_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '100.00' })
      .where(eq(wallets.id, wallet.id));

    const item1 = await createTestCatalogItem(container, {
      name: 'Service Item 1',
      usdPrice: '10.00',
      isActive: true,
    });
    const item2 = await createTestCatalogItem(container, {
      name: 'Service Item 2',
      usdPrice: '20.00',
      isActive: true,
    });

    // 1. Place first order
    await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item1.id,
    });

    // 2. Place second order (most recent)
    const { order: order2 } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item2.id,
    });

    const latest = await getTestLatestOrderForBuyer(container, {
      userId: buyer.id,
    });

    expect(latest).toBeDefined();
    expect(latest?.order.id).toBe(order2.id);
    expect(latest?.order.status).toBe('PLACED');
    expect(latest?.catalogItem?.id).toBe(item2.id);
    expect(latest?.catalogItem?.name).toBe('Service Item 2');
    expect(latest?.buyer.id).toBe(buyer.id);

    // Also works when resolved via telegramChatId
    const latestByChatId = await getTestLatestOrderForBuyer(container, {
      telegramChatId: 99112233,
    });
    expect(latestByChatId?.order.id).toBe(order2.id);
  });

  it('buyer order status service returns null when buyer has no orders', async () => {
    const { buyer } = await createTestBuyer(container, {
      telegramChatId: 11998877,
      telegramUsername: 'no_orders_buyer',
    });

    const latest = await getTestLatestOrderForBuyer(container, {
      userId: buyer.id,
    });

    expect(latest).toBeNull();
  });
});
