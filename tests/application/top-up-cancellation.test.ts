import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDatabase } from '../helpers/test-db';
import { topUpRequests } from '../../src/db/schema/top-up-requests';
import { wallets } from '../../src/db/schema/wallets';
import { ledgerTransactions } from '../../src/db/schema/ledger';
import { setRate } from '../../src/application/exchange-rate/exchange-rate.service';
import {
  initiateTopUp,
  submitReceipt,
  cancelTopUp,
} from '../../src/application/top-up/top-up.service';
import { registerBuyer } from '../../src/application/buyer/registration.service';
import {
  CannotCancelPendingTopUpError,
  NoActiveTopUpRequestError,
} from '../../src/domain/top-up/top-up.errors';
import { eq } from 'drizzle-orm';

describe('Top-Up Cancellation Service', () => {
  const { db } = setupTestDatabase();
  const adminId = 123456789n;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.TOPUP_MIN_USD = '10.00';
    process.env.TOPUP_MAX_USD = '1000.00';
    process.env.TOPUP_INITIATED_EXPIRY_MINUTES = '30';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  async function createTestBuyer(telegramChatId = 987654321n) {
    const { buyer, wallet } = await registerBuyer(
      {
        telegramChatId,
        telegramUsername: 'test_buyer',
      },
      db
    );
    return { buyer, wallet };
  }

  it('cancels INITIATED request successfully (status -> CANCELLED, row persisted)', async () => {
    const { buyer } = await createTestBuyer();
    await setRate(adminId, 620000n, db);

    const initResult = await initiateTopUp({ userId: buyer.id, usdAmount: '100.00' }, db);
    expect(initResult.request.status).toBe('INITIATED');

    const cancelResult = await cancelTopUp({ userId: buyer.id }, db);

    expect(cancelResult).toBeDefined();
    expect(cancelResult.request.id).toBe(initResult.request.id);
    expect(cancelResult.request.status).toBe('CANCELLED');

    // Verify row persisted in DB
    const [dbRow] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, initResult.request.id));
    expect(dbRow?.status).toBe('CANCELLED');
  });

  it('throws CannotCancelPendingTopUpError on PENDING request and leaves row unchanged', async () => {
    const { buyer } = await createTestBuyer();
    await setRate(adminId, 620000n, db);

    const initResult = await initiateTopUp({ userId: buyer.id, usdAmount: '100.00' }, db);
    await submitReceipt({ userId: buyer.id, fileId: 'receipt_123', caption: 'Paid' }, db);

    await expect(cancelTopUp({ userId: buyer.id }, db)).rejects.toThrow(
      CannotCancelPendingTopUpError
    );

    // Verify row in DB is still PENDING and untouched
    const [dbRow] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, initResult.request.id));
    expect(dbRow?.status).toBe('PENDING');
    expect(dbRow?.receiptFileId).toBe('receipt_123');
  });

  it('throws NoActiveTopUpRequestError when buyer has no active request', async () => {
    const { buyer } = await createTestBuyer();

    await expect(cancelTopUp({ userId: buyer.id }, db)).rejects.toThrow(
      NoActiveTopUpRequestError
    );

    const rows = await db.select().from(topUpRequests);
    expect(rows).toHaveLength(0);
  });

  it('cancellation does not affect available_balance or write any ledger entries', async () => {
    const { buyer, wallet } = await createTestBuyer();
    await setRate(adminId, 620000n, db);

    // Initial wallet balance is 0.00
    expect(wallet.availableBalance).toBe('0.00');

    const initResult = await initiateTopUp({ userId: buyer.id, usdAmount: '100.00' }, db);
    await cancelTopUp({ userId: buyer.id }, db);

    // Verify wallet balance is unchanged
    const [walletRow] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, buyer.id));
    expect(walletRow?.availableBalance).toBe('0.00');

    // Verify no ledger transactions were written
    const ledgerRows = await db.select().from(ledgerTransactions);
    expect(ledgerRows).toHaveLength(0);
  });
});
