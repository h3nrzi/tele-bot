import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import { TopUpService } from '@/modules/top-up/top-up.service';
import { BuyerService } from '@/modules/buyer/buyer.service';
import { topUpRequests } from '@/modules/top-up/top-up.schema';
import { eq } from 'drizzle-orm';

describe('Admin Pending Top-Up Queue Service', () => {
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

  async function createBuyerAndSubmit(chatId: bigint, username: string | null, amount: string) {
    const { buyer } = await buyerService.register({ telegramChatId: chatId, telegramUsername: username });
    await exchangeRateService.setRate({ adminTelegramId: adminId, irrPerUsd: 600000n });
    const { request } = await topUpService.initiateTopUp({ userId: buyer.id, usdAmount: amount });
    return await topUpService.submitReceipt({ userId: buyer.id, fileId: `file_${chatId}`, caption: `Receipt for ${amount}` });
  }

  it('returns empty list when no requests are in PENDING status', async () => {
    const list = await topUpService.getPendingRequests();
    expect(list).toEqual([]);
  });

  it('returns pending requests sorted in FIFO order (createdAt ASC)', async () => {
    const r1 = await createBuyerAndSubmit(111n, 'buyer_one', '20.00');
    // Tick to ensure distinct timestamps
    await new Promise((r) => setTimeout(r, 20));
    const r2 = await createBuyerAndSubmit(222n, 'buyer_two', '50.00');
    await new Promise((r) => setTimeout(r, 20));
    const r3 = await createBuyerAndSubmit(333n, 'buyer_three', '100.00');

    const pending = await topUpService.getPendingRequests();
    expect(pending).toHaveLength(3);

    // FIFO order: r1 first, then r2, then r3
    expect(pending[0]?.id).toBe(r1.request.id);
    expect(pending[0]?.telegramChatId).toBe(111n);
    expect(pending[0]?.telegramUsername).toBe('buyer_one');
    expect(pending[0]?.usdAmount).toBe('20.00');
    expect(pending[0]?.receiptFileId).toBe('file_111');

    expect(pending[1]?.id).toBe(r2.request.id);
    expect(pending[1]?.telegramChatId).toBe(222n);

    expect(pending[2]?.id).toBe(r3.request.id);
    expect(pending[2]?.telegramChatId).toBe(333n);
  });

  it('filters out non-PENDING requests (INITIATED, APPROVED, REJECTED, CANCELLED, EXPIRED)', async () => {
    // 1. Pending item
    const pendingItem = await createBuyerAndSubmit(100n, 'pending_buyer', '30.00');

    // 2. Initiated only item (no receipt)
    const { buyer: initBuyer } = await buyerService.register({ telegramChatId: 200n, telegramUsername: 'init_buyer' });
    await topUpService.initiateTopUp({ userId: initBuyer.id, usdAmount: '40.00' });

    // 3. Approved item
    const toApprove = await createBuyerAndSubmit(300n, 'approved_buyer', '50.00');
    await topUpService.approveTopUp({ topUpRequestId: toApprove.request.id, adminTelegramId: adminId });

    // 4. Rejected item
    const toReject = await createBuyerAndSubmit(400n, 'rejected_buyer', '60.00');
    await topUpService.rejectTopUp({ topUpRequestId: toReject.request.id, adminTelegramId: adminId, rejectionReason: 'Bad receipt' });

    // 5. Cancelled item
    const { buyer: cancelBuyer } = await buyerService.register({ telegramChatId: 500n, telegramUsername: 'cancel_buyer' });
    await topUpService.initiateTopUp({ userId: cancelBuyer.id, usdAmount: '70.00' });
    await topUpService.cancelTopUp({ userId: cancelBuyer.id });

    const pending = await topUpService.getPendingRequests();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.id).toBe(pendingItem.request.id);
  });

  it('handles buyers without username (telegramUsername = null)', async () => {
    const item = await createBuyerAndSubmit(999n, null, '80.00');
    const pending = await topUpService.getPendingRequests();

    expect(pending).toHaveLength(1);
    expect(pending[0]?.telegramUsername).toBeNull();
    expect(pending[0]?.telegramChatId).toBe(999n);
  });
});
