import 'reflect-metadata';
import { TOKENS } from '@/core/di/tokens';
import { CatalogService } from '@/modules/catalog/catalog.service';
import { ledgerEntries, ledgerTransactions } from '@/modules/ledger/ledger.schema';
import {
  CatalogItemUnavailableError,
  InsufficientBalanceForOrderError,
} from '@/modules/order/order.errors';
import { orders } from '@/modules/order/order.schema';
import { OrderService } from '@/modules/order/order.service';
import { wallets } from '@/modules/wallet/wallet.schema';
import {
  createTestBuyer,
  createTestCatalogItem,
  placeTestOrder,
} from '@tests/helpers/fixtures';
import { InMemoryOrderNotifier } from '@tests/helpers/in-memory-order-notifier';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { count, eq } from 'drizzle-orm';
import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Order Placement Service (Ticket 04)', () => {
  const { db, container } = setupTestDatabase();
  let notifier: InMemoryOrderNotifier;

  beforeEach(() => {
    notifier = new InMemoryOrderNotifier();
    container.register(TOKENS.OrderNotifier, { useValue: notifier });
  });

  it('places an order atomically: debits wallet, creates PLACED order, and writes double-entry ledger entries', async () => {
    const { buyer, wallet: initialWallet } = await createTestBuyer(container, {
      telegramChatId: 11223344,
      telegramUsername: 'test_buyer',
    });

    // Set initial wallet balance to $50.00
    await db
      .update(wallets)
      .set({ availableBalance: '50.00' })
      .where(eq(wallets.id, initialWallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'Telegram Premium 3 Months',
      description: 'Instant automated delivery',
      usdPrice: '14.99',
      isActive: true,
    });

    const orderService = container.resolve(OrderService);
    const result = await orderService.placeOrder({
      userId: buyer.id,
      catalogItemId: item.id,
    });

    // 1. Assert result structure
    expect(result.order.id).toBeDefined();
    expect(result.order.status).toBe('PLACED');
    expect(result.order.usdPriceSnapshot).toBe('14.99');
    expect(result.order.catalogItemId).toBe(item.id);
    expect(result.order.userId).toBe(buyer.id);
    expect(result.wallet.availableBalance).toBe('35.01');

    // 2. Assert orders DB state
    const [dbOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, result.order.id));

    expect(dbOrder).toBeDefined();
    expect(dbOrder?.status).toBe('PLACED');
    expect(dbOrder?.usdPriceSnapshot).toBe('14.99');
    expect(dbOrder?.userId).toBe(buyer.id);
    expect(dbOrder?.catalogItemId).toBe(item.id);

    // 3. Assert wallet DB state
    const [dbWallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.id, initialWallet.id));

    expect(dbWallet?.availableBalance).toBe('35.01');

    // 4. Assert ledger transaction & entries in DB
    const [dbTx] = await db
      .select()
      .from(ledgerTransactions)
      .where(eq(ledgerTransactions.orderId, result.order.id));

    expect(dbTx).toBeDefined();
    expect(dbTx?.orderId).toBe(result.order.id);
    expect(dbTx?.topUpRequestId).toBeNull();
    expect(dbTx?.reversedByLedgerTransactionId).toBeNull();

    const dbEntries = await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.ledgerTransactionId, dbTx!.id));

    expect(dbEntries).toHaveLength(2);

    const debitEntry = dbEntries.find((e) => e.direction === 'DEBIT');
    const creditEntry = dbEntries.find((e) => e.direction === 'CREDIT');

    expect(debitEntry).toBeDefined();
    expect(debitEntry?.accountType).toBe('BUYER_WALLET');
    expect(debitEntry?.usdAmount).toBe('14.99');
    expect(debitEntry?.walletId).toBe(initialWallet.id);

    expect(creditEntry).toBeDefined();
    expect(creditEntry?.accountType).toBe('SYSTEM_CASH');
    expect(creditEntry?.usdAmount).toBe('14.99');
    expect(creditEntry?.walletId).toBeNull();
  });

  it('locks price snapshot permanently: subsequent catalog item price change does not alter order snapshot', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: 22334455,
      telegramUsername: 'price_test_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '100.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'VPN 1 Month',
      usdPrice: '5.00',
      isActive: true,
    });

    const orderService = container.resolve(OrderService);
    const result = await orderService.placeOrder({
      userId: buyer.id,
      catalogItemId: item.id,
    });

    expect(result.order.usdPriceSnapshot).toBe('5.00');

    // Admin updates catalog item price to $10.00
    const catalogService = container.resolve(CatalogService);
    await catalogService.editCatalogItem(item.id, {
      usdPrice: '10.00',
    });

    // Check existing order in DB
    const [dbOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, result.order.id));

    expect(dbOrder?.usdPriceSnapshot).toBe('5.00');
  });

  it('rejects placement when available balance is insufficient at transaction time', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: 33445566,
      telegramUsername: 'broke_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '4.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'Expensive Service',
      usdPrice: '10.00',
      isActive: true,
    });

    const orderService = container.resolve(OrderService);

    await expect(
      orderService.placeOrder({
        userId: buyer.id,
        catalogItemId: item.id,
      })
    ).rejects.toThrow(InsufficientBalanceForOrderError);

    // Assert no orders created
    const [orderCount] = await db.select({ value: count() }).from(orders);
    expect(Number(orderCount?.value ?? 0)).toBe(0);

    // Assert no ledger transactions written
    const [txCount] = await db
      .select({ value: count() })
      .from(ledgerTransactions);
    expect(Number(txCount?.value ?? 0)).toBe(0);

    // Assert balance unchanged
    const [dbWallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.id, wallet.id));
    expect(dbWallet?.availableBalance).toBe('4.00');
  });

  it('rejects placement for deactivated or non-existent catalog items', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: 44556677,
      telegramUsername: 'inactive_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '50.00' })
      .where(eq(wallets.id, wallet.id));

    const inactiveItem = await createTestCatalogItem(container, {
      name: 'Deactivated Service',
      usdPrice: '10.00',
      isActive: false,
    });

    const orderService = container.resolve(OrderService);

    await expect(
      orderService.placeOrder({
        userId: buyer.id,
        catalogItemId: inactiveItem.id,
      })
    ).rejects.toThrow(CatalogItemUnavailableError);

    await expect(
      orderService.placeOrder({
        userId: buyer.id,
        catalogItemId: '00000000-0000-0000-0000-000000000000',
      })
    ).rejects.toThrow(CatalogItemUnavailableError);
  });

  it('resolves buyer via telegramChatId input', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: 55667788,
      telegramUsername: 'chat_id_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '20.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'Test Service',
      usdPrice: '8.00',
      isActive: true,
    });

    const orderService = container.resolve(OrderService);
    const result = await orderService.placeOrder({
      telegramChatId: 55667788,
      catalogItemId: item.id,
    });

    expect(result.order.userId).toBe(buyer.id);
    expect(result.wallet.availableBalance).toBe('12.00');
  });

  it('prevents negative balance during concurrent order placements on the same wallet', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: 66778899,
      telegramUsername: 'race_buyer',
    });

    // Wallet has $20.00
    await db
      .update(wallets)
      .set({ availableBalance: '20.00' })
      .where(eq(wallets.id, wallet.id));

    // Item costs $15.00
    const item = await createTestCatalogItem(container, {
      name: 'Game Pass 1 Month',
      usdPrice: '15.00',
      isActive: true,
    });

    const orderService = container.resolve(OrderService);

    // Launch two simultaneous placement attempts
    const [result1, result2] = await Promise.allSettled([
      orderService.placeOrder({
        userId: buyer.id,
        catalogItemId: item.id,
      }),
      orderService.placeOrder({
        userId: buyer.id,
        catalogItemId: item.id,
      }),
    ]);

    const fulfilledCount = [result1, result2].filter(
      (r) => r.status === 'fulfilled'
    ).length;
    const rejectedCount = [result1, result2].filter(
      (r) => r.status === 'rejected'
    ).length;

    expect(fulfilledCount).toBe(1);
    expect(rejectedCount).toBe(1);

    // Assert rejected reason was insufficient balance
    const rejectedResult = [result1, result2].find(
      (r) => r.status === 'rejected'
    ) as PromiseRejectedResult;
    expect(rejectedResult.reason).toBeInstanceOf(
      InsufficientBalanceForOrderError
    );

    // Verify wallet balance is exactly $5.00, not -$10.00
    const [dbWallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.id, wallet.id));
    expect(dbWallet?.availableBalance).toBe('5.00');

    // Exactly 1 order in DB
    const [orderCount] = await db.select({ value: count() }).from(orders);
    expect(Number(orderCount?.value ?? 0)).toBe(1);

    // Exactly 1 ledger transaction in DB
    const [txCount] = await db
      .select({ value: count() })
      .from(ledgerTransactions);
    expect(Number(txCount?.value ?? 0)).toBe(1);
  });

  it('dispatches admin notifications via injected IOrderNotifier', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: 77889900,
      telegramUsername: 'notify_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '30.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'Netflix 1 Month',
      description: '4K Ultra HD',
      usdPrice: '12.00',
      isActive: true,
    });

    const result = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });

    expect(notifier.recordedPlaced).toHaveLength(1);
    const recorded = notifier.recordedPlaced[0]!;
    expect(recorded.order.id).toBe(result.order.id);
    expect(recorded.catalogItem.name).toBe('Netflix 1 Month');
    expect(recorded.buyer.id).toBe(buyer.id);
    expect(recorded.postDebitBalance).toBe('18.00');
  });

  it('completes order placement successfully even if admin notification dispatch fails', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: 88990011,
      telegramUsername: 'fail_notify_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '30.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'Spotify 3 Months',
      usdPrice: '10.00',
      isActive: true,
    });

    vi.spyOn(notifier, 'onOrderPlaced').mockRejectedValueOnce(
      new Error('Telegram network outage')
    );

    const result = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });

    expect(result.order.status).toBe('PLACED');
    expect(result.wallet.availableBalance).toBe('20.00');

    // Order and ledger are committed in DB
    const [dbOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, result.order.id));
    expect(dbOrder).toBeDefined();
    expect(dbOrder?.status).toBe('PLACED');
  });
});
