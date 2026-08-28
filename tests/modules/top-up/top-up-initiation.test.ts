import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { users } from '@/modules/buyer/buyer.schema';
import { topUpRequests } from '@/modules/top-up/top-up.schema';
import { setRate } from '@/modules/exchange-rate/exchange-rate.service';
import {
  initiateTopUp,
  getActiveTopUpRequest,
} from '@/modules/top-up/top-up.service';
import {
  ActiveTopUpRequestExistsError,
  InvalidTopUpAmountError,
} from '@/modules/top-up/top-up.errors';
import { NoExchangeRateError } from '@/modules/exchange-rate/exchange-rate.errors';
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

  async function seedPrerequisites() {
    const [user] = await db
      .insert(users)
      .values({
        telegramChatId: 987654321n,
        telegramUsername: 'testbuyer',
      })
      .returning();

    const rate = await setRate({ adminTelegramId: adminId, irrPerUsd: 600000n }, db);

    return { user: user!, rate };
  }

  it('initiates a top-up request with valid amount and calculates IRR amount accurately', async () => {
    const { user, rate } = await seedPrerequisites();

    const result = await initiateTopUp(
      {
        userId: user.id,
        usdAmount: '50.00',
      },
      db
    );

    expect(result).toBeDefined();
    expect(result.request).toBeDefined();
    expect(result.request.userId).toBe(user.id);
    expect(result.request.usdAmount).toBe('50.00');
    expect(result.request.irrAmount).toBe(30000000n); // 50 * 600,000
    expect(result.request.exchangeRateId).toBe(rate.id);
    expect(result.request.status).toBe('INITIATED');
    expect(result.request.expiresAt).toBeInstanceOf(Date);

    // Verify in database
    const [row] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, result.request.id));
    expect(row).toBeDefined();
    expect(row!.status).toBe('INITIATED');
    expect(row!.usdAmount).toBe('50.00');
    expect(row!.irrAmount).toBe(30000000n);
  });

  it('rejects initiation if user already has an active INITIATED request', async () => {
    const { user } = await seedPrerequisites();

    await initiateTopUp({ userId: user.id, usdAmount: '50.00' }, db);

    await expect(
      initiateTopUp({ userId: user.id, usdAmount: '100.00' }, db)
    ).rejects.toThrow(ActiveTopUpRequestExistsError);
  });

  it('throws NoExchangeRateError when attempting to initiate without active exchange rate', async () => {
    const [user] = await db
      .insert(users)
      .values({
        telegramChatId: 11223344n,
        telegramUsername: 'norateuser',
      })
      .returning();

    await expect(
      initiateTopUp({ userId: user!.id, usdAmount: '50.00' }, db)
    ).rejects.toThrow(NoExchangeRateError);
  });

  it('throws InvalidTopUpAmountError when amount is below configured minimum', async () => {
    const { user } = await seedPrerequisites();

    await expect(
      initiateTopUp({ userId: user.id, usdAmount: '5.00' }, db)
    ).rejects.toThrow(InvalidTopUpAmountError);
  });

  it('throws InvalidTopUpAmountError when amount is above configured maximum', async () => {
    const { user } = await seedPrerequisites();

    await expect(
      initiateTopUp({ userId: user.id, usdAmount: '1500.00' }, db)
    ).rejects.toThrow(InvalidTopUpAmountError);
  });

  it('throws InvalidTopUpAmountError on non-numeric or negative amount', async () => {
    const { user } = await seedPrerequisites();

    await expect(
      initiateTopUp({ userId: user.id, usdAmount: '-10.00' }, db)
    ).rejects.toThrow(InvalidTopUpAmountError);

    await expect(
      initiateTopUp({ userId: user.id, usdAmount: 'invalid' }, db)
    ).rejects.toThrow(InvalidTopUpAmountError);
  });

  it('calculates expires_at based on TOPUP_INITIATED_EXPIRY_MINUTES', async () => {
    const { user } = await seedPrerequisites();
    process.env.TOPUP_INITIATED_EXPIRY_MINUTES = '45';

    const before = Date.now();
    const { request } = await initiateTopUp(
      { userId: user.id, usdAmount: '50.00' },
      db
    );
    const after = Date.now();

    const expectedMinMs = before + 45 * 60 * 1000;
    const expectedMaxMs = after + 45 * 60 * 1000;

    expect(request.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMinMs);
    expect(request.expiresAt.getTime()).toBeLessThanOrEqual(expectedMaxMs);
  });

  it('returns active top-up request with getActiveTopUpRequest', async () => {
    const { user } = await seedPrerequisites();

    const notFound = await getActiveTopUpRequest(user.id, db);
    expect(notFound).toBeNull();

    const created = await initiateTopUp(
      { userId: user.id, usdAmount: '75.00' },
      db
    );

    const active = await getActiveTopUpRequest(user.id, db);
    expect(active).toBeDefined();
    expect(active!.id).toBe(created.request.id);
    expect(active!.status).toBe('INITIATED');
  });
});
