import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDatabase } from '../helpers/test-db';
import { users } from '../../src/db/schema/users';
import { topUpRequests } from '../../src/db/schema/top-up-requests';
import { setRate } from '../../src/services/exchange-rate.service';
import {
  initiateTopUp,
  getActiveTopUpRequest,
  NoExchangeRateError,
  ActiveTopUpRequestExistsError,
  InvalidTopUpAmountError,
} from '../../src/services/top-up.service';
import { eq } from 'drizzle-orm';
import Decimal from 'decimal.js';

describe('Top-Up Initiation Service', () => {
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
    const [buyer] = await db
      .insert(users)
      .values({
        telegramChatId,
        telegramUsername: 'test_buyer',
      })
      .returning();
    return buyer!;
  }

  it('happy path: creates a top_up_requests row with locked rate, computed irr_amount, and expires_at', async () => {
    const buyer = await createTestBuyer();
    const rate = await setRate(adminId, 620000n, db);

    const startTime = new Date();
    const result = await initiateTopUp({ userId: buyer.id, usdAmount: '100.00' }, db);

    expect(result).toBeDefined();
    expect(result.request).toBeDefined();
    expect(result.request.id).toBeDefined();
    expect(result.request.userId).toBe(buyer.id);
    expect(result.request.exchangeRateId).toBe(rate.id);
    expect(result.request.usdAmount).toBe('100.00');
    expect(result.request.irrAmount).toBe(62000000n);
    expect(result.request.status).toBe('INITIATED');
    expect(result.request.receiptFileId).toBeNull();
    expect(result.request.receiptCaption).toBeNull();
    expect(result.request.rejectionReason).toBeNull();

    // Verify expires_at is approximately 30 minutes in future
    const expiresAt = new Date(result.request.expiresAt);
    const expectedMinExpiry = new Date(startTime.getTime() + 29 * 60 * 1000);
    const expectedMaxExpiry = new Date(startTime.getTime() + 31 * 60 * 1000);
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMinExpiry.getTime());
    expect(expiresAt.getTime()).toBeLessThanOrEqual(expectedMaxExpiry.getTime());

    // Verify row in DB
    const dbRows = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, result.request.id));
    expect(dbRows).toHaveLength(1);
    expect(dbRows[0]?.status).toBe('INITIATED');
    expect(dbRows[0]?.exchangeRateId).toBe(rate.id);
  });

  it('rejects initiation when amount is below TOPUP_MIN_USD', async () => {
    const buyer = await createTestBuyer();
    await setRate(adminId, 620000n, db);

    await expect(
      initiateTopUp({ userId: buyer.id, usdAmount: '9.99' }, db)
    ).rejects.toThrow(InvalidTopUpAmountError);

    const rows = await db.select().from(topUpRequests);
    expect(rows).toHaveLength(0);
  });

  it('rejects initiation when amount is above TOPUP_MAX_USD', async () => {
    const buyer = await createTestBuyer();
    await setRate(adminId, 620000n, db);

    await expect(
      initiateTopUp({ userId: buyer.id, usdAmount: '1000.01' }, db)
    ).rejects.toThrow(InvalidTopUpAmountError);

    const rows = await db.select().from(topUpRequests);
    expect(rows).toHaveLength(0);
  });

  it('rejects initiation with NoExchangeRateError when no exchange rate has been set', async () => {
    const buyer = await createTestBuyer();

    await expect(
      initiateTopUp({ userId: buyer.id, usdAmount: '50.00' }, db)
    ).rejects.toThrow(NoExchangeRateError);

    const rows = await db.select().from(topUpRequests);
    expect(rows).toHaveLength(0);
  });

  it('rejects second initiation with ActiveTopUpRequestExistsError while INITIATED request is active', async () => {
    const buyer = await createTestBuyer();
    await setRate(adminId, 620000n, db);

    // First request
    const firstResult = await initiateTopUp({ userId: buyer.id, usdAmount: '50.00' }, db);
    expect(firstResult.request.status).toBe('INITIATED');

    // Second request attempt
    await expect(
      initiateTopUp({ userId: buyer.id, usdAmount: '100.00' }, db)
    ).rejects.toThrow(ActiveTopUpRequestExistsError);

    const rows = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.userId, buyer.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(firstResult.request.id);
  });

  it('rejects second initiation with ActiveTopUpRequestExistsError while PENDING request is active', async () => {
    const buyer = await createTestBuyer();
    await setRate(adminId, 620000n, db);

    const firstResult = await initiateTopUp({ userId: buyer.id, usdAmount: '50.00' }, db);

    // Move first request to PENDING
    await db
      .update(topUpRequests)
      .set({ status: 'PENDING', receiptFileId: 'file_123' })
      .where(eq(topUpRequests.id, firstResult.request.id));

    // Second request attempt
    await expect(
      initiateTopUp({ userId: buyer.id, usdAmount: '100.00' }, db)
    ).rejects.toThrow(ActiveTopUpRequestExistsError);
  });

  it('allows new initiation after previous request transitions to terminal state (APPROVED / REJECTED / EXPIRED / CANCELLED)', async () => {
    const buyer = await createTestBuyer();
    await setRate(adminId, 620000n, db);

    // First request
    const firstResult = await initiateTopUp({ userId: buyer.id, usdAmount: '50.00' }, db);

    // Transition first request to APPROVED
    await db
      .update(topUpRequests)
      .set({ status: 'APPROVED' })
      .where(eq(topUpRequests.id, firstResult.request.id));

    // Second request should now succeed
    const secondResult = await initiateTopUp({ userId: buyer.id, usdAmount: '75.00' }, db);
    expect(secondResult.request.id).not.toBe(firstResult.request.id);
    expect(secondResult.request.status).toBe('INITIATED');

    const allBuyerRequests = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.userId, buyer.id));
    expect(allBuyerRequests).toHaveLength(2);
  });

  describe('getActiveTopUpRequest', () => {
    it('returns the active INITIATED or PENDING request for a buyer, or null if none exists', async () => {
      const buyer = await createTestBuyer();
      await setRate(adminId, 620000n, db);

      // Initially null
      expect(await getActiveTopUpRequest(buyer.id, db)).toBeNull();

      // After initiation -> returns INITIATED request
      const initResult = await initiateTopUp({ userId: buyer.id, usdAmount: '50.00' }, db);
      const active1 = await getActiveTopUpRequest(buyer.id, db);
      expect(active1).not.toBeNull();
      expect(active1?.id).toBe(initResult.request.id);
      expect(active1?.status).toBe('INITIATED');

      // Update to PENDING -> returns PENDING request
      await db
        .update(topUpRequests)
        .set({ status: 'PENDING' })
        .where(eq(topUpRequests.id, initResult.request.id));

      const active2 = await getActiveTopUpRequest(buyer.id, db);
      expect(active2).not.toBeNull();
      expect(active2?.id).toBe(initResult.request.id);
      expect(active2?.status).toBe('PENDING');

      // Update to APPROVED -> returns null
      await db
        .update(topUpRequests)
        .set({ status: 'APPROVED' })
        .where(eq(topUpRequests.id, initResult.request.id));

      expect(await getActiveTopUpRequest(buyer.id, db)).toBeNull();
    });
  });
});
