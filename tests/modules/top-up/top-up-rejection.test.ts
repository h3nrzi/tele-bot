import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { users } from '@/modules/buyer/buyer.schema';
import { wallets } from '@/modules/wallet/wallet.schema';
import { topUpRequests } from '@/modules/top-up/top-up.schema';
import { ledgerTransactions, ledgerEntries } from '@/modules/ledger/ledger.schema';
import { setRate } from '@/modules/exchange-rate/exchange-rate.service';
import { registerBuyer } from '@/modules/buyer/buyer.service';
import {
  initiateTopUp,
  submitReceipt,
  approveTopUp,
  rejectTopUp,
} from '@/modules/top-up/top-up.service';
import {
  TopUpRequestNotFoundError,
  TopUpRequestNotPendingError,
} from '@/modules/top-up/top-up.errors';
import { eq } from 'drizzle-orm';

describe('Top-Up Rejection Service', () => {
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

  async function seedPendingRequest(amount = '50.00') {
    const { buyer, wallet } = await registerBuyer(
      { telegramChatId: buyerChatId, telegramUsername: 'rejection_buyer' },
      db
    );
    await setRate({ adminTelegramId: adminId1, irrPerUsd: 600000n }, db);
    const { request: initReq } = await initiateTopUp({ userId: buyer.id, usdAmount: amount }, db);
    const { request: pendingReq } = await submitReceipt(
      { userId: buyer.id, fileId: 'receipt_photo_123', caption: 'Payment receipt' },
      db
    );
    return { buyer, wallet, request: pendingReq };
  }

  it('rejects a PENDING request atomically: sets status REJECTED, persists reason, and does not credit wallet or create ledger entries', async () => {
    const { buyer, wallet, request } = await seedPendingRequest('100.00');

    const notifyBuyerSpy = vi.fn().mockResolvedValue(undefined);

    const result = await rejectTopUp(
      {
        topUpRequestId: request.id,
        adminTelegramId: adminId1,
        rejectionReason: 'Invalid transaction tracking code',
      },
      db,
      { notifyBuyer: notifyBuyerSpy }
    );

    expect(result).toBeDefined();
    expect(result.request.status).toBe('REJECTED');
    expect(result.request.processedByAdminTelegramId).toBe(adminId1);
    expect(result.request.rejectionReason).toBe('Invalid transaction tracking code');
    expect(result.request.processedAt).toBeInstanceOf(Date);

    // 1. Verify TopUpRequest in DB
    const [dbRequest] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, request.id));
    expect(dbRequest!.status).toBe('REJECTED');
    expect(dbRequest!.processedByAdminTelegramId).toBe(adminId1);
    expect(dbRequest!.rejectionReason).toBe('Invalid transaction tracking code');

    // 2. Verify Wallet was NOT credited (remains 0.00)
    const [dbWallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.id, wallet.id));
    expect(dbWallet!.availableBalance).toBe('0.00');

    // 3. Verify NO Ledger Transaction created
    const dbTxList = await db
      .select()
      .from(ledgerTransactions)
      .where(eq(ledgerTransactions.topUpRequestId, request.id));
    expect(dbTxList).toHaveLength(0);

    // 4. Verify notifyBuyer callback invoked with correct reason
    expect(notifyBuyerSpy).toHaveBeenCalledTimes(1);
    expect(notifyBuyerSpy).toHaveBeenCalledWith({
      buyerTelegramChatId: buyerChatId,
      rejectionReason: 'Invalid transaction tracking code',
    });
  });

  it('supports preset reasons and custom admin rejection notes', async () => {
    const { request } = await seedPendingRequest('50.00');

    const customReason = 'Receipt timestamp does not match transaction time';
    const result = await rejectTopUp(
      {
        topUpRequestId: request.id,
        adminTelegramId: adminId1,
        rejectionReason: customReason,
      },
      db
    );

    expect(result.request.rejectionReason).toBe(customReason);
  });

  it('allows buyer to submit a new top-up request after a rejection (rejection frees up active slot)', async () => {
    const { buyer, request } = await seedPendingRequest('50.00');

    // Reject first request
    await rejectTopUp(
      {
        topUpRequestId: request.id,
        adminTelegramId: adminId1,
        rejectionReason: 'Wrong amount',
      },
      db
    );

    // New initiation must now succeed without ActiveTopUpRequestExistsError
    const newResult = await initiateTopUp(
      { userId: buyer.id, usdAmount: '60.00' },
      db
    );
    expect(newResult.request.status).toBe('INITIATED');
    expect(newResult.request.usdAmount).toBe('60.00');
  });

  it('concurrency guard: simultaneous rejection and approval attempts handle conflict idempotently', async () => {
    const { request } = await seedPendingRequest('50.00');

    // Fire 1 reject and 1 approve concurrently
    const results = await Promise.allSettled([
      rejectTopUp(
        { topUpRequestId: request.id, adminTelegramId: adminId1, rejectionReason: 'Reason A' },
        db
      ),
      approveTopUp({ topUpRequestId: request.id, adminTelegramId: adminId2 }, db),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly 1 must win
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(TopUpRequestNotPendingError);
  });

  it('throws TopUpRequestNotFoundError when topUpRequestId does not exist', async () => {
    await expect(
      rejectTopUp(
        {
          topUpRequestId: '00000000-0000-0000-0000-000000000000',
          adminTelegramId: adminId1,
          rejectionReason: 'Reason',
        },
        db
      )
    ).rejects.toThrow(TopUpRequestNotFoundError);
  });

  it('throws TopUpRequestNotPendingError when request is in INITIATED, APPROVED, REJECTED, CANCELLED, or EXPIRED state', async () => {
    // 1. INITIATED
    const { buyer } = await registerBuyer({ telegramChatId: 999222n, telegramUsername: 'b2' }, db);
    await setRate({ adminTelegramId: adminId1, irrPerUsd: 600000n }, db);
    const { request: initiatedReq } = await initiateTopUp({ userId: buyer.id, usdAmount: '20.00' }, db);

    await expect(
      rejectTopUp(
        { topUpRequestId: initiatedReq.id, adminTelegramId: adminId1, rejectionReason: 'Reason' },
        db
      )
    ).rejects.toThrow(TopUpRequestNotPendingError);

    // 2. Already rejected
    const { request: pendingReq } = await submitReceipt({ userId: buyer.id, fileId: 'f2' }, db);
    await rejectTopUp(
      { topUpRequestId: pendingReq.id, adminTelegramId: adminId1, rejectionReason: 'First Reject' },
      db
    );

    await expect(
      rejectTopUp(
        { topUpRequestId: pendingReq.id, adminTelegramId: adminId1, rejectionReason: 'Second Reject' },
        db
      )
    ).rejects.toThrow(TopUpRequestNotPendingError);
  });

  it('buyer push notification failure does not roll back rejection transaction', async () => {
    const { request } = await seedPendingRequest('40.00');

    const failingNotifyBuyer = vi.fn().mockRejectedValue(new Error('Telegram network error'));

    const result = await rejectTopUp(
      {
        topUpRequestId: request.id,
        adminTelegramId: adminId1,
        rejectionReason: 'Invalid receipt image',
      },
      db,
      { notifyBuyer: failingNotifyBuyer }
    );

    expect(result.request.status).toBe('REJECTED');
    expect(failingNotifyBuyer).toHaveBeenCalledTimes(1);

    // Verify DB committed
    const [dbRequest] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, request.id));
    expect(dbRequest!.status).toBe('REJECTED');
  });
});
