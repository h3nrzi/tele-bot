import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { topUpRequests } from '@/modules/top-up/top-up.schema';
import { wallets } from '@/modules/wallet/wallet.schema';
import { ledgerTransactions } from '@/modules/ledger/ledger.schema';
import { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import { TopUpService } from '@/modules/top-up/top-up.service';
import { BuyerService } from '@/modules/buyer/buyer.service';
import {
  CannotCancelPendingTopUpError,
  NoActiveTopUpRequestError,
} from '@/modules/top-up/top-up.errors';
import { eq } from 'drizzle-orm';

describe('Top-Up Cancellation Service', () => {
  const { db, container } = setupTestDatabase();
  let buyerService: BuyerService;
  let topUpService: TopUpService;
  let exchangeRateService: ExchangeRateService;
  const adminId = 123456789n;
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

  async function seedInitiatedRequest(amount = '50.00') {
    const { buyer, wallet } = await buyerService.register(
      { telegramChatId: 987654321n, telegramUsername: 'cancel_buyer' }
    );
    await exchangeRateService.setRate({ adminTelegramId: adminId, irrPerUsd: 600000n });
    const { request } = await topUpService.initiateTopUp({ userId: buyer.id, usdAmount: amount });
    return { buyer, wallet, request };
  }

  it('cancels an active INITIATED request and sets status to CANCELLED atomically', async () => {
    const { buyer, request } = await seedInitiatedRequest('50.00');

    const result = await topUpService.cancelTopUp({ userId: buyer.id });

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

    await topUpService.cancelTopUp({ userId: buyer.id });

    // New initiation succeeds
    const newResult = await topUpService.initiateTopUp({ userId: buyer.id, usdAmount: '100.00' });
    expect(newResult.request.status).toBe('INITIATED');
    expect(newResult.request.usdAmount).toBe('100.00');
  });

  it('throws CannotCancelPendingTopUpError when request is in PENDING status (receipt submitted)', async () => {
    const { buyer } = await seedInitiatedRequest('50.00');
    await topUpService.submitReceipt({ userId: buyer.id, fileId: 'receipt_123' });

    await expect(topUpService.cancelTopUp({ userId: buyer.id })).rejects.toThrow(
      CannotCancelPendingTopUpError
    );
  });

  it('throws NoActiveTopUpRequestError when buyer has no active request to cancel', async () => {
    const { buyer } = await buyerService.register(
      { telegramChatId: 111333n, telegramUsername: 'no_req_buyer' }
    );

    await expect(topUpService.cancelTopUp({ userId: buyer.id })).rejects.toThrow(
      NoActiveTopUpRequestError
    );
  });
});
