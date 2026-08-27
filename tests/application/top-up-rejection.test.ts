import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTestDatabase } from '../helpers/test-db';
import { users } from '../../src/db/schema/users';
import { wallets } from '../../src/db/schema/wallets';
import { topUpRequests } from '../../src/db/schema/top-up-requests';
import { ledgerTransactions, ledgerEntries } from '../../src/db/schema/ledger';
import { setRate } from '../../src/application/exchange-rate/exchange-rate.service';
import { registerBuyer } from '../../src/application/buyer/registration.service';
import {
  initiateTopUp,
  submitReceipt,
  approveTopUp,
  rejectTopUp,
} from '../../src/application/top-up/top-up.service';
import {
  TopUpRequestNotFoundError,
  TopUpRequestNotPendingError,
} from '../../src/domain/top-up/top-up.errors';
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

  async function setupPendingTopUp(usdAmount = '100.00', initialBalance = '50.00') {
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
        caption: 'Mellat bank receipt',
      },
      db
    );

    return { buyer, wallet, request: pendingReq };
  }

  it('happy path: rejects pending request with preset reason, updates status to REJECTED, sets processedByAdminTelegramId and processedAt, writes NO ledger entries, leaves wallet balance unchanged', async () => {
    const { buyer, wallet, request } = await setupPendingTopUp('100.00', '50.00');

    const result = await rejectTopUp(
      {
        topUpRequestId: request.id,
        adminTelegramId: adminId1,
        rejectionReason: 'Wrong amount',
      },
      db
    );

    // 1. Verify returned result
    expect(result).toBeDefined();
    expect(result.request.id).toBe(request.id);
    expect(result.request.status).toBe('REJECTED');
    expect(result.request.rejectionReason).toBe('Wrong amount');
    expect(result.request.processedByAdminTelegramId).toBe(adminId1);
    expect(result.request.processedAt).toBeInstanceOf(Date);
    expect(result.buyerChatId).toBe(buyerChatId);

    // 2. Verify top_up_requests in DB
    const [dbRequest] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, request.id));
    expect(dbRequest?.status).toBe('REJECTED');
    expect(dbRequest?.rejectionReason).toBe('Wrong amount');
    expect(dbRequest?.processedByAdminTelegramId).toBe(adminId1);
    expect(dbRequest?.processedAt).toBeDefined();

    // 3. Verify wallets in DB remains unchanged
    const [dbWallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.id, wallet.id));
    expect(dbWallet?.availableBalance).toBe('50.00');

    // 4. Verify NO ledger transactions or entries were written
    const txRows = await db.select().from(ledgerTransactions);
    expect(txRows).toHaveLength(0);
    const entryRows = await db.select().from(ledgerEntries);
    expect(entryRows).toHaveLength(0);
  });

  it('stores custom rejection reason correctly', async () => {
    const { request } = await setupPendingTopUp('100.00', '0.00');
    const customReason = 'Receipt timestamp does not match transaction window.';

    const result = await rejectTopUp(
      {
        topUpRequestId: request.id,
        adminTelegramId: adminId1,
        rejectionReason: customReason,
      },
      db
    );

    expect(result.request.status).toBe('REJECTED');
    expect(result.request.rejectionReason).toBe(customReason);

    const [dbRequest] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, request.id));
    expect(dbRequest?.rejectionReason).toBe(customReason);
  });

  it('stores combined preset + custom note correctly', async () => {
    const { request } = await setupPendingTopUp('100.00', '0.00');
    const combinedReason =
      'Wrong amount — you sent 5,900,000 IRR but the request was for 6,200,000 IRR';

    const result = await rejectTopUp(
      {
        topUpRequestId: request.id,
        adminTelegramId: adminId1,
        rejectionReason: combinedReason,
      },
      db
    );

    expect(result.request.status).toBe('REJECTED');
    expect(result.request.rejectionReason).toBe(combinedReason);

    const [dbRequest] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, request.id));
    expect(dbRequest?.rejectionReason).toBe(combinedReason);
  });

  it('throws TopUpRequestNotPendingError when request is in INITIATED status', async () => {
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
      rejectTopUp(
        {
          topUpRequestId: initiatedReq.id,
          adminTelegramId: adminId1,
          rejectionReason: 'Wrong amount',
        },
        db
      )
    ).rejects.toThrow(TopUpRequestNotPendingError);

    // Verify DB state is unmodified
    const [dbRequest] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, initiatedReq.id));
    expect(dbRequest?.status).toBe('INITIATED');
    expect(dbRequest?.rejectionReason).toBeNull();
  });

  it('throws TopUpRequestNotFoundError when topUpRequestId does not exist', async () => {
    await expect(
      rejectTopUp(
        {
          topUpRequestId: '00000000-0000-0000-0000-000000000000',
          adminTelegramId: adminId1,
          rejectionReason: 'Wrong amount',
        },
        db
      )
    ).rejects.toThrow(TopUpRequestNotFoundError);
  });

  it('multi-Admin race: two concurrent rejection calls result in exactly one rejection and one already processed error', async () => {
    const { request } = await setupPendingTopUp('150.00', '0.00');

    const results = await Promise.allSettled([
      rejectTopUp(
        {
          topUpRequestId: request.id,
          adminTelegramId: adminId1,
          rejectionReason: 'Reason 1',
        },
        db
      ),
      rejectTopUp(
        {
          topUpRequestId: request.id,
          adminTelegramId: adminId2,
          rejectionReason: 'Reason 2',
        },
        db
      ),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const rejectedError = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectedError).toBeInstanceOf(TopUpRequestNotPendingError);

    // Verify top_up_requests is REJECTED and modified only once
    const [dbRequest] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, request.id));
    expect(dbRequest?.status).toBe('REJECTED');
  });

  it('race between approval and rejection: if approved first, rejection returns already processed error', async () => {
    const { request, wallet } = await setupPendingTopUp('100.00', '0.00');

    // First admin approves
    await approveTopUp(
      { topUpRequestId: request.id, adminTelegramId: adminId1 },
      db
    );

    // Second admin tries to reject
    await expect(
      rejectTopUp(
        {
          topUpRequestId: request.id,
          adminTelegramId: adminId2,
          rejectionReason: 'Too late',
        },
        db
      )
    ).rejects.toThrow(TopUpRequestNotPendingError);

    // Status remains APPROVED
    const [dbRequest] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, request.id));
    expect(dbRequest?.status).toBe('APPROVED');
    expect(dbRequest?.rejectionReason).toBeNull();
  });

  it('buyer push notification: invokes notifyBuyer dependency after commit, and notification failure does not roll back transaction', async () => {
    const { request } = await setupPendingTopUp('75.00', '25.00');

    const notifyBuyerSuccess = vi.fn(async () => {});

    const result = await rejectTopUp(
      {
        topUpRequestId: request.id,
        adminTelegramId: adminId1,
        rejectionReason: 'Unreadable receipt',
      },
      db,
      {
        notifyBuyer: notifyBuyerSuccess,
      }
    );

    expect(notifyBuyerSuccess).toHaveBeenCalledTimes(1);
    expect(notifyBuyerSuccess).toHaveBeenCalledWith({
      buyerTelegramChatId: buyerChatId,
      rejectionReason: 'Unreadable receipt',
    });

    // Test notification failure case with a new pending request
    const { request: request2 } = await setupPendingTopUp('50.00', '100.00');

    const notifyBuyerFailing = vi.fn(async () => {
      throw new Error('Telegram network error');
    });

    // Rejection should NOT throw despite notification failure
    const result2 = await rejectTopUp(
      {
        topUpRequestId: request2.id,
        adminTelegramId: adminId1,
        rejectionReason: 'Duplicate submission',
      },
      db,
      {
        notifyBuyer: notifyBuyerFailing,
      }
    );

    expect(result2.request.status).toBe('REJECTED');
    expect(result2.request.rejectionReason).toBe('Duplicate submission');

    // DB state is committed
    const [dbReq2] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, request2.id));
    expect(dbReq2?.status).toBe('REJECTED');
    expect(dbReq2?.rejectionReason).toBe('Duplicate submission');
  });
});
