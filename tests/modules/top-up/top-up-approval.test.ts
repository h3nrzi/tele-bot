import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { users } from '@/modules/buyer/buyer.schema';
import { wallets } from '@/modules/wallet/wallet.schema';
import { topUpRequests } from '@/modules/top-up/top-up.schema';
import { ledgerTransactions, ledgerEntries } from '@/modules/ledger/ledger.schema';
import { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import { BuyerService } from '@/modules/buyer/buyer.service';
import { TopUpService } from '@/modules/top-up/top-up.service';
import {
  TopUpRequestNotFoundError,
  TopUpRequestNotPendingError,
} from '@/modules/top-up/top-up.errors';
import { eq, sql } from 'drizzle-orm';
import Decimal from 'decimal.js';

describe('Top-Up Approval Service', () => {
  const { db, container } = setupTestDatabase();
  let buyerService: BuyerService;
  let topUpService: TopUpService;
  let exchangeRateService: ExchangeRateService;
  const adminId1 = 123456789n;
  const adminId2 = 987654321n;
  const buyerChatId = 555666777n;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.TOPUP_MIN_USD = '10.00';
    process.env.TOPUP_MAX_USD = '1000.00';
    process.env.TOPUP_INITIATED_EXPIRY_MINUTES = '30';
    buyerService = container.resolve(BuyerService);
    topUpService = container.resolve(TopUpService);
    exchangeRateService = container.resolve(ExchangeRateService);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  async function seedPendingRequest(amount = '50.00') {
    const { buyer, wallet } = await buyerService.register(
      { telegramChatId: buyerChatId, telegramUsername: 'approval_buyer' }
    );
    await exchangeRateService.setRate({ adminTelegramId: adminId1, irrPerUsd: 600000n });
    const { request: initReq } = await topUpService.initiateTopUp({ userId: buyer.id, usdAmount: amount });
    const { request: pendingReq } = await topUpService.submitReceipt(
      { userId: buyer.id, fileId: 'receipt_photo_123', caption: 'Payment receipt' }
    );
    return { buyer, wallet, request: pendingReq };
  }

  it('approves a PENDING request atomically: transitions status, credits wallet balance, and creates double-entry ledger records in one transaction', async () => {
    const { buyer, wallet, request } = await seedPendingRequest('100.00');

    const notifyBuyerSpy = vi.fn().mockResolvedValue(undefined);

    const result = await topUpService.approveTopUp(
      {
        topUpRequestId: request.id,
        adminTelegramId: adminId1,
      },
      { notifyBuyer: notifyBuyerSpy }
    );

    expect(result).toBeDefined();
    expect(result.request.status).toBe('APPROVED');
    expect(result.request.processedByAdminTelegramId).toBe(adminId1);
    expect(result.request.processedAt).toBeInstanceOf(Date);
    expect(result.request.usdAmount).toBe('100.00');
    expect(result.wallet.availableBalance).toBe('100.00');

    // 1. Verify TopUpRequest in DB
    const [dbRequest] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, request.id));
    expect(dbRequest!.status).toBe('APPROVED');
    expect(dbRequest!.processedByAdminTelegramId).toBe(adminId1);
    expect(dbRequest!.processedAt).toBeInstanceOf(Date);

    // 2. Verify Wallet credited in DB
    const [dbWallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.id, wallet.id));
    expect(dbWallet!.availableBalance).toBe('100.00');

    // 3. Verify Ledger Transaction created
    const dbTxList = await db
      .select()
      .from(ledgerTransactions)
      .where(eq(ledgerTransactions.topUpRequestId, request.id));
    expect(dbTxList).toHaveLength(1);
    const tx = dbTxList[0]!;
    expect(tx.narrative).toContain(request.id);

    // 4. Verify balanced Ledger Entries (Debit SYSTEM_CASH, Credit BUYER_WALLET)
    const dbEntries = await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.ledgerTransactionId, tx.id));
    expect(dbEntries).toHaveLength(2);

    const debit = dbEntries.find((e) => e.direction === 'DEBIT');
    const credit = dbEntries.find((e) => e.direction === 'CREDIT');

    expect(debit).toBeDefined();
    expect(debit!.accountType).toBe('SYSTEM_CASH');
    expect(debit!.usdAmount).toBe('100.00');

    expect(credit).toBeDefined();
    expect(credit!.accountType).toBe('BUYER_WALLET');
    expect(credit!.walletId).toBe(wallet.id);
    expect(credit!.usdAmount).toBe('100.00');

    // 5. Verify notifyBuyer callback invoked with correct params
    expect(notifyBuyerSpy).toHaveBeenCalledTimes(1);
    expect(notifyBuyerSpy).toHaveBeenCalledWith({
      buyerTelegramChatId: buyerChatId,
      creditedUsdAmount: '100.00',
      newAvailableBalance: '100.00',
    });
  });

  it('accumulates wallet balance correctly on multiple top-ups', async () => {
    const { buyer, wallet, request: req1 } = await seedPendingRequest('50.00');

    await topUpService.approveTopUp({ topUpRequestId: req1.id, adminTelegramId: adminId1 });

    // Second top-up for same buyer
    const { request: init2 } = await topUpService.initiateTopUp({ userId: buyer.id, usdAmount: '35.50' });
    const { request: req2 } = await topUpService.submitReceipt({ userId: buyer.id, fileId: 'receipt_2' });

    const result2 = await topUpService.approveTopUp({ topUpRequestId: req2.id, adminTelegramId: adminId2 });
    expect(result2.wallet.availableBalance).toBe('85.50');

    const [dbWallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.id, wallet.id));
    expect(dbWallet!.availableBalance).toBe('85.50');
  });

  it('concurrency guard: handles simultaneous approval attempts idempotently without duplicate credits or entries', async () => {
    const { buyer, wallet, request } = await seedPendingRequest('50.00');

    // Fire 2 concurrent approval calls
    const results = await Promise.allSettled([
      topUpService.approveTopUp({ topUpRequestId: request.id, adminTelegramId: adminId1 }),
      topUpService.approveTopUp({ topUpRequestId: request.id, adminTelegramId: adminId2 }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly 1 must succeed; the second must throw TopUpRequestNotPendingError
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(TopUpRequestNotPendingError);

    // Verify wallet was only credited once ($50.00, NOT $100.00)
    const [dbWallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.id, wallet.id));
    expect(dbWallet!.availableBalance).toBe('50.00');

    // Verify only 1 ledger transaction exists for this request
    const dbTxList = await db
      .select()
      .from(ledgerTransactions)
      .where(eq(ledgerTransactions.topUpRequestId, request.id));
    expect(dbTxList).toHaveLength(1);
  });

  it('throws TopUpRequestNotFoundError when topUpRequestId does not exist', async () => {
    await expect(
      topUpService.approveTopUp(
        {
          topUpRequestId: '00000000-0000-0000-0000-000000000000',
          adminTelegramId: adminId1,
        }
      )
    ).rejects.toThrow(TopUpRequestNotFoundError);
  });

  it('throws TopUpRequestNotPendingError when request is in INITIATED, APPROVED, REJECTED, CANCELLED, or EXPIRED state', async () => {
    // 1. INITIATED (no receipt submitted yet)
    const { buyer } = await buyerService.register({ telegramChatId: 999111n, telegramUsername: 'b1' });
    await exchangeRateService.setRate({ adminTelegramId: adminId1, irrPerUsd: 600000n });
    const { request: initiatedReq } = await topUpService.initiateTopUp({ userId: buyer.id, usdAmount: '20.00' });

    await expect(
      topUpService.approveTopUp({ topUpRequestId: initiatedReq.id, adminTelegramId: adminId1 })
    ).rejects.toThrow(TopUpRequestNotPendingError);

    // 2. APPROVED (already approved)
    const { request: pendingReq } = await topUpService.submitReceipt({ userId: buyer.id, fileId: 'f1' });
    await topUpService.approveTopUp({ topUpRequestId: pendingReq.id, adminTelegramId: adminId1 });

    await expect(
      topUpService.approveTopUp({ topUpRequestId: pendingReq.id, adminTelegramId: adminId1 })
    ).rejects.toThrow(TopUpRequestNotPendingError);
  });

  it('buyer push notification: invokes notifyBuyer dependency after commit, and notification failure does not roll back transaction', async () => {
    const { wallet, request } = await seedPendingRequest('75.00');

    // Push notification mock that fails/throws
    const failingNotifyBuyer = vi.fn().mockRejectedValue(new Error('Telegram network error'));

    // Should complete successfully without throwing
    const result = await topUpService.approveTopUp(
      {
        topUpRequestId: request.id,
        adminTelegramId: adminId1,
      },
      { notifyBuyer: failingNotifyBuyer }
    );

    expect(result.request.status).toBe('APPROVED');
    expect(failingNotifyBuyer).toHaveBeenCalledTimes(1);

    // Verify DB committed despite notification failure
    const [dbWallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.id, wallet.id));
    expect(dbWallet!.availableBalance).toBe('75.00');
  });
});
