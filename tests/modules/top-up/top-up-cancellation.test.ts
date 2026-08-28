import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { topUpRequests } from '@/modules/top-up/top-up.schema';
import { wallets } from '@/modules/wallet/wallet.schema';
import { ledgerTransactions } from '@/modules/ledger/ledger.schema';
import { setRate } from '@/modules/exchange-rate/exchange-rate.service';
import {
  initiateTopUp,
  submitReceipt,
  cancelTopUp,
} from '@/modules/top-up/top-up.service';
import { registerBuyer } from '@/modules/buyer/buyer.service';
import {
  CannotCancelPendingTopUpError,
  NoActiveTopUpRequestError,
} from '@/modules/top-up/top-up.errors';
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

  async function seedInitiatedRequest(amount = '50.00') {
    const { buyer, wallet } = await registerBuyer(
      { telegramChatId: 987654321n, telegramUsername: 'cancel_buyer' },
      db
    );
    await setRate({ adminTelegramId: adminId, irrPerUsd: 600000n }, db);
    const { request } = await initiateTopUp({ userId: buyer.id, usdAmount: amount }, db);
    return { buyer, wallet, request };
  }

  it('cancels an active INITIATED request and sets status to CANCELLED atomically', async () => {
    const { buyer, request } = await seedInitiatedRequest('50.00');

    const result = await cancelTopUp({ userId: buyer.id }, db);

    expect(result).toBeDefined();
    expect(result.request.id).toBe(request.id);
    expect(result.request.status).toBe('CANCELLED');

    // Verify DB
    const [dbRequest] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, request.id));
    expect(dbRequest!.status).toBe('CANCELLED');

    // Verify no ledger entries created
    const dbTxList = await db
      .select()
      .from(ledgerTransactions)
      .where(eq(ledgerTransactions.topUpRequestId, request.id));
    expect(dbTxList).toHaveLength(0);
  });

  it('allows buyer to initiate a new top-up request after cancellation (cancellation frees up active slot)', async () => {
    const { buyer, request } = await seedInitiatedRequest('50.00');

    await cancelTopUp({ userId: buyer.id }, db);

    // New initiation succeeds
    const newResult = await initiateTopUp({ userId: buyer.id, usdAmount: '100.00' }, db);
    expect(newResult.request.status).toBe('INITIATED');
    expect(newResult.request.usdAmount).toBe('100.00');
  });

  it('throws CannotCancelPendingTopUpError when request is in PENDING status (receipt submitted)', async () => {
    const { buyer } = await seedInitiatedRequest('50.00');
    await submitReceipt({ userId: buyer.id, fileId: 'receipt_123' }, db);

    await expect(cancelTopUp({ userId: buyer.id }, db)).rejects.toThrow(
      CannotCancelPendingTopUpError
    );
  });

  it('throws NoActiveTopUpRequestError when buyer has no active request to cancel', async () => {
    const { buyer } = await registerBuyer(
      { telegramChatId: 111333n, telegramUsername: 'no_req_buyer' },
      db
    );

    await expect(cancelTopUp({ userId: buyer.id }, db)).rejects.toThrow(
      NoActiveTopUpRequestError
    );
  });
});
