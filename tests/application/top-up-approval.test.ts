import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { users } from '@/db/schema/users';
import { wallets } from '@/db/schema/wallets';
import { topUpRequests } from '@/db/schema/top-up-requests';
import { ledgerTransactions, ledgerEntries } from '@/db/schema/ledger';
import { setRate } from '@/application/exchange-rate/exchange-rate.service';
import { registerBuyer } from '@/application/buyer/registration.service';
import {
  initiateTopUp,
  submitReceipt,
  approveTopUp,
} from '@/application/top-up/top-up.service';
import {
  TopUpRequestNotFoundError,
  TopUpRequestNotPendingError,
} from '@/domain/top-up/top-up.errors';
import { eq, sql } from 'drizzle-orm';
import Decimal from 'decimal.js';

describe('Top-Up Approval Service', () => {
  const { db } = setupTestDatabase();
  const adminId1 = 123456789n;
  const adminId2 = 987654321n;
  const buyerChatId = 555666777n;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.TOPUP_MIN_USD = '10.00';
    process.env.TOPUP_MAX_USD = '1000.00';
    process.env.TOPUP_INITIATED_EXPIRY_MINUTES = '30';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  async function setupPendingTopUp(usdAmount = '100.00', initialBalance = '0.00') {
    const { buyer, wallet } = await registerBuyer(
      { telegramChatId: buyerChatId, telegramUsername: 'test_buyer' },
      db
    );

    if (initialBalance !== '0.00') {
      await db
        .update(wallets)
        .set({ availableBalance: initialBalance })
        .where(eq(wallets.id, wallet.id));
    }

    await setRate(adminId1, 620000n, db);

    const { request: initiatedReq } = await initiateTopUp(
      { userId: buyer.id, usdAmount },
      db
    );

    const { request: pendingReq } = await submitReceipt(
      {
        userId: buyer.id,
        fileId: 'receipt_photo_123',
        caption: 'Mellat bank payment proof',
      },
      db
    );

    return { buyer, wallet, request: pendingReq };
  }

  it('happy path: approves pending request, writes double-entry ledger rows, credits wallet balance, and updates request status to APPROVED', async () => {
    const { buyer, wallet, request } = await setupPendingTopUp('100.00', '0.00');

    const result = await approveTopUp(
      {
        topUpRequestId: request.id,
        adminTelegramId: adminId1,
      },
      db
    );

    // 1. Verify returned result
    expect(result).toBeDefined();
    expect(result.request.id).toBe(request.id);
    expect(result.request.status).toBe('APPROVED');
    expect(result.request.processedByAdminTelegramId).toBe(adminId1);
    expect(result.request.processedAt).toBeInstanceOf(Date);
    expect(result.wallet.availableBalance).toBe('100.00');
    expect(result.buyerChatId).toBe(buyerChatId);

    // 2. Verify top_up_requests in DB
    const [dbRequest] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, request.id));
    expect(dbRequest?.status).toBe('APPROVED');
    expect(dbRequest?.processedByAdminTelegramId).toBe(adminId1);
    expect(dbRequest?.processedAt).toBeDefined();

    // 3. Verify wallets in DB
    const [dbWallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.id, wallet.id));
    expect(dbWallet?.availableBalance).toBe('100.00');

    // 4. Verify ledger_transactions in DB
    const txRows = await db
      .select()
      .from(ledgerTransactions)
      .where(eq(ledgerTransactions.topUpRequestId, request.id));
    expect(txRows).toHaveLength(1);
    const ledgerTx = txRows[0]!;
    expect(ledgerTx.narrative).toContain(request.id);

    // 5. Verify ledger_entries in DB
    const entryRows = await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.ledgerTransactionId, ledgerTx.id));
    expect(entryRows).toHaveLength(2);

    const systemCashEntry = entryRows.find((e) => e.accountType === 'SYSTEM_CASH');
    const buyerWalletEntry = entryRows.find((e) => e.accountType === 'BUYER_WALLET');

    expect(systemCashEntry).toBeDefined();
    expect(systemCashEntry?.direction).toBe('DEBIT');
    expect(systemCashEntry?.usdAmount).toBe('100.00');
    expect(systemCashEntry?.walletId).toBeNull();

    expect(buyerWalletEntry).toBeDefined();
    expect(buyerWalletEntry?.direction).toBe('CREDIT');
    expect(buyerWalletEntry?.usdAmount).toBe('100.00');
    expect(buyerWalletEntry?.walletId).toBe(wallet.id);
  });

  it('uses decimal.js for exact financial arithmetic and preserves 2 decimal places in available_balance', async () => {
    // Initial balance: 10.10, topup: 20.20 -> result must be exactly 30.30 (avoid IEEE 754 precision issues: 10.10 + 20.20 !== 30.300000000000004)
    const { buyer, wallet, request } = await setupPendingTopUp('20.20', '10.10');

    const result = await approveTopUp(
      {
        topUpRequestId: request.id,
        adminTelegramId: adminId1,
      },
      db
    );

    expect(result.wallet.availableBalance).toBe('30.30');

    const [dbWallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.id, wallet.id));
    expect(dbWallet?.availableBalance).toBe('30.30');
  });

  it('maintains the ledger self-balance invariant: sum(CREDIT) === sum(DEBIT) for every ledger transaction', async () => {
    const { request } = await setupPendingTopUp('250.50', '50.00');

    await approveTopUp(
      {
        topUpRequestId: request.id,
        adminTelegramId: adminId1,
      },
      db
    );

    const allTx = await db.select().from(ledgerTransactions);
    expect(allTx.length).toBeGreaterThan(0);

    for (const tx of allTx) {
      const entries = await db
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.ledgerTransactionId, tx.id));

      let totalDebit = new Decimal(0);
      let totalCredit = new Decimal(0);

      for (const entry of entries) {
        if (entry.direction === 'DEBIT') {
          totalDebit = totalDebit.plus(new Decimal(entry.usdAmount));
        } else if (entry.direction === 'CREDIT') {
          totalCredit = totalCredit.plus(new Decimal(entry.usdAmount));
        }
      }

      expect(totalDebit.toString()).toBe(totalCredit.toString());
      expect(totalDebit.toFixed(2)).toBe('250.50');
      expect(totalCredit.toFixed(2)).toBe('250.50');
    }
  });

  it('throws TopUpRequestNotPendingError when request is in INITIATED status and writes no ledger entries', async () => {
    const { buyer, wallet } = await registerBuyer(
      { telegramChatId: buyerChatId, telegramUsername: 'test_buyer' },
      db
    );
    await setRate(adminId1, 620000n, db);

    const { request: initiatedReq } = await initiateTopUp(
      { userId: buyer.id, usdAmount: '100.00' },
      db
    );

    await expect(
      approveTopUp(
        {
          topUpRequestId: initiatedReq.id,
          adminTelegramId: adminId1,
        },
        db
      )
    ).rejects.toThrow(TopUpRequestNotPendingError);

    // Verify DB state is unmodified
    const ledgerTxCount = await db.select().from(ledgerTransactions);
    expect(ledgerTxCount).toHaveLength(0);

    const [dbWallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.id, wallet.id));
    expect(dbWallet?.availableBalance).toBe('0.00');

    const [dbRequest] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, initiatedReq.id));
    expect(dbRequest?.status).toBe('INITIATED');
  });

  it('throws TopUpRequestNotFoundError when topUpRequestId does not exist', async () => {
    await expect(
      approveTopUp(
        {
          topUpRequestId: '00000000-0000-0000-0000-000000000000',
          adminTelegramId: adminId1,
        },
        db
      )
    ).rejects.toThrow(TopUpRequestNotFoundError);
  });

  it('multi-Admin race: two concurrent approval calls result in exactly one approval and one "already processed" rejection', async () => {
    const { request, wallet } = await setupPendingTopUp('150.00', '0.00');

    // Run two concurrent approval calls simultaneously
    const results = await Promise.allSettled([
      approveTopUp({ topUpRequestId: request.id, adminTelegramId: adminId1 }, db),
      approveTopUp({ topUpRequestId: request.id, adminTelegramId: adminId2 }, db),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const rejectedError = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectedError).toBeInstanceOf(TopUpRequestNotPendingError);

    // Verify DB ledger has exactly 1 transaction and 2 entries
    const txRows = await db.select().from(ledgerTransactions);
    expect(txRows).toHaveLength(1);

    const entryRows = await db.select().from(ledgerEntries);
    expect(entryRows).toHaveLength(2);

    // Verify wallet was credited exactly once
    const [dbWallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.id, wallet.id));
    expect(dbWallet?.availableBalance).toBe('150.00');
  });

  it('buyer push notification: invokes notifyBuyer dependency after commit, and notification failure does not roll back transaction', async () => {
    const { request, wallet } = await setupPendingTopUp('75.00', '25.00');

    const notifyBuyerSuccess = vi.fn(async () => {});

    const result = await approveTopUp(
      {
        topUpRequestId: request.id,
        adminTelegramId: adminId1,
      },
      db,
      {
        notifyBuyer: notifyBuyerSuccess,
      }
    );

    expect(notifyBuyerSuccess).toHaveBeenCalledTimes(1);
    expect(notifyBuyerSuccess).toHaveBeenCalledWith({
      buyerTelegramChatId: buyerChatId,
      creditedUsdAmount: '75.00',
      newAvailableBalance: '100.00',
    });

    // Test notification failure case with a new pending request
    const { request: request2 } = await setupPendingTopUp('50.00', '100.00');

    const notifyBuyerFailing = vi.fn(async () => {
      throw new Error('Telegram network error');
    });

    // Approval should NOT throw despite notification failure
    const result2 = await approveTopUp(
      {
        topUpRequestId: request2.id,
        adminTelegramId: adminId1,
      },
      db,
      {
        notifyBuyer: notifyBuyerFailing,
      }
    );

    expect(result2.request.status).toBe('APPROVED');
    expect(result2.wallet.availableBalance).toBe('150.00');

    // DB state is committed
    const [dbReq2] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, request2.id));
    expect(dbReq2?.status).toBe('APPROVED');
  });
});
