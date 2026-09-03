import { describe, it, expect } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import {
  createTestBuyer,
  createTestCatalogItem,
  placeTestOrder,
  claimTestOrder,
  rejectTestOrder,
} from '@tests/helpers/fixtures';
import { OrderService } from '@/modules/order/order.service';
import {
  OrderNotFoundError,
  InvalidOrderStatusError,
  OrderRejectionNoteRequiredError,
} from '@/modules/order/order.errors';
import { orders } from '@/modules/order/order.schema';
import { wallets } from '@/modules/wallet/wallet.schema';
import { ledgerTransactions, ledgerEntries } from '@/modules/ledger/ledger.schema';
import { eq } from 'drizzle-orm';
import type { OrderAdminNotificationPayload } from '@/modules/order/dtos/order.dto';

describe('Order Rejection Service (Ticket 07)', () => {
  const { db, container } = setupTestDatabase();

  it('happy path from PLACED: refund ledger written, balance restored, status -> REJECTED, reversed_by link set', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: 11223344,
      telegramUsername: 'placed_reject_buyer',
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

    // 2. Reject order from PLACED
    const orderService = container.resolve(OrderService);
    const adminTelegramId = 99887766n;

    const rejectionCategory = 'OUT_OF_STOCK';
    const rejectionNote = 'Item is temporarily out of stock from upstream supplier.';

    const result = await orderService.rejectOrder({
      orderId: placedOrder.id,
      adminTelegramId,
      rejectionCategory,
      rejectionNote,
    });

    // 3. Assert Result Object
    expect(result.order.id).toBe(placedOrder.id);
    expect(result.order.status).toBe('REJECTED');
    expect(result.order.rejectionCategory).toBe(rejectionCategory);
    expect(result.order.rejectionNote).toBe(rejectionNote);
    expect(result.order.rejectedAt).toBeInstanceOf(Date);
    expect(result.wallet.availableBalance).toBe('100.00');
    expect(result.buyer.id).toBe(buyer.id);

    // 4. Assert DB Order State
    const [dbOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, placedOrder.id));

    expect(dbOrder).toBeDefined();
    expect(dbOrder?.status).toBe('REJECTED');
    expect(dbOrder?.rejectionCategory).toBe(rejectionCategory);
    expect(dbOrder?.rejectionNote).toBe(rejectionNote);
    expect(dbOrder?.rejectedAt).toBeInstanceOf(Date);

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

  it('happy path from PROCESSING: claiming admin rejects order, balance restored, refund ledger written', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: 22334455,
      telegramUsername: 'proc_reject_buyer',
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
    const { order: placedOrder, ledgerTransaction: originalDebitTx } =
      await placeTestOrder(container, {
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

    // 3. Reject order from PROCESSING
    const result = await orderService.rejectOrder({
      orderId: placedOrder.id,
      adminTelegramId,
      rejectionCategory: 'TECHNICAL_ISSUE',
      rejectionNote: null,
    });

    // 4. Assert Order status is REJECTED
    expect(result.order.status).toBe('REJECTED');
    expect(result.order.rejectionCategory).toBe('TECHNICAL_ISSUE');
    expect(result.order.rejectionNote).toBeNull();
    expect(result.order.rejectedAt).toBeInstanceOf(Date);

    // 5. Assert Wallet balance is restored to 50.00
    expect(result.wallet.availableBalance).toBe('50.00');

    // 6. Assert original debit is linked to refund transaction
    const [originalDbTx] = await db
      .select()
      .from(ledgerTransactions)
      .where(eq(ledgerTransactions.id, originalDebitTx.id));

    expect(originalDbTx?.reversedByLedgerTransactionId).toBe(
      result.refundLedgerTransaction.id
    );
  });

  it('validates OTHER rejection category: requires non-empty rejectionNote', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: 33445566,
      telegramUsername: 'other_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '50.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'Spotify 1 Month',
      usdPrice: '5.00',
      isActive: true,
    });

    const { order: placedOrder } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });

    const orderService = container.resolve(OrderService);

    // Missing note with OTHER category throws OrderRejectionNoteRequiredError
    await expect(
      orderService.rejectOrder({
        orderId: placedOrder.id,
        rejectionCategory: 'OTHER',
        rejectionNote: undefined,
      })
    ).rejects.toThrow(OrderRejectionNoteRequiredError);

    await expect(
      orderService.rejectOrder({
        orderId: placedOrder.id,
        rejectionCategory: 'OTHER',
        rejectionNote: '   ',
      })
    ).rejects.toThrow(OrderRejectionNoteRequiredError);

    // With note, OTHER category succeeds
    const successResult = await orderService.rejectOrder({
      orderId: placedOrder.id,
      rejectionCategory: 'OTHER',
      rejectionNote: 'Custom reason explanation provided by admin.',
    });

    expect(successResult.order.status).toBe('REJECTED');
    expect(successResult.order.rejectionCategory).toBe('OTHER');
    expect(successResult.order.rejectionNote).toBe(
      'Custom reason explanation provided by admin.'
    );
  });

  it('rejects rejection attempt on non-existent order with OrderNotFoundError', async () => {
    const orderService = container.resolve(OrderService);

    await expect(
      orderService.rejectOrder({
        orderId: '00000000-0000-0000-0000-000000000000',
        rejectionCategory: 'OUT_OF_STOCK',
      })
    ).rejects.toThrow(OrderNotFoundError);
  });

  it('rejects rejection attempt on already-terminal orders (FULFILLED, REJECTED, CANCELLED) with InvalidOrderStatusError', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: 44556677,
      telegramUsername: 'terminal_reject_buyer',
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

    // 1. Order already FULFILLED
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
      orderService.rejectOrder({
        orderId: order1.id,
        rejectionCategory: 'OUT_OF_STOCK',
      })
    ).rejects.toThrow(InvalidOrderStatusError);

    // 2. Order already REJECTED (second rejection)
    const { order: order2 } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });
    await orderService.rejectOrder({
      orderId: order2.id,
      rejectionCategory: 'OUT_OF_STOCK',
    });

    await expect(
      orderService.rejectOrder({
        orderId: order2.id,
        rejectionCategory: 'POLICY_VIOLATION',
      })
    ).rejects.toThrow(InvalidOrderStatusError);

    // 3. Order already CANCELLED
    const { order: order3 } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });
    await db
      .update(orders)
      .set({ status: 'CANCELLED', cancelledAt: new Date() })
      .where(eq(orders.id, order3.id));

    await expect(
      orderService.rejectOrder({
        orderId: order3.id,
        rejectionCategory: 'OUT_OF_STOCK',
      })
    ).rejects.toThrow(InvalidOrderStatusError);
  });

  it('notifies Buyer and updates all Admin notifications via callbacks', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: 77889900,
      telegramUsername: 'callback_buyer',
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

    const result = await rejectTestOrder(
      container,
      {
        orderId: placedOrder.id,
        adminTelegramId: 1001n,
        rejectionCategory: 'CANNOT_VERIFY',
        rejectionNote: 'Unable to verify payment legitimacy.',
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
    expect(capturedBuyerContext.rejectionCategory).toBe('CANNOT_VERIFY');
    expect(capturedBuyerContext.rejectionNote).toBe(
      'Unable to verify payment legitimacy.'
    );
    expect(capturedBuyerContext.refundAmount).toBe('10.00');
    expect(capturedBuyerContext.updatedBalance).toBe('50.00');

    // 2. Assert admin notification context
    expect(capturedAdminContext).toBeDefined();
    expect(capturedAdminContext.order.id).toBe(placedOrder.id);
    expect(capturedAdminContext.order.status).toBe('REJECTED');
    expect(capturedAdminContext.rejectionCategory).toBe('CANNOT_VERIFY');
    expect(capturedAdminContext.rejectionNote).toBe(
      'Unable to verify payment legitimacy.'
    );
    expect(capturedAdminContext.adminTelegramId).toBe(1001n);
    expect(capturedAdminContext.notifications).toHaveLength(2);

    expect(result.adminNotifications).toHaveLength(2);
  });

  it('completes rejection successfully even if notification callbacks throw errors (resilience)', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: 88990011,
      telegramUsername: 'resilience_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '50.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'Service Y',
      usdPrice: '12.00',
      isActive: true,
    });

    const { order: placedOrder } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });

    const result = await rejectTestOrder(
      container,
      {
        orderId: placedOrder.id,
        adminTelegramId: 1001n,
        rejectionCategory: 'POLICY_VIOLATION',
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

    // Rejection still committed
    expect(result.order.status).toBe('REJECTED');
    expect(result.wallet.availableBalance).toBe('50.00');

    const [dbOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, placedOrder.id));
    expect(dbOrder?.status).toBe('REJECTED');
  });
});
