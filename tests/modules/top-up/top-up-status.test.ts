import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { topUpRequests } from '@/modules/top-up/top-up.schema';
import { setRate } from '@/modules/exchange-rate/exchange-rate.service';
import {
  initiateTopUp,
  cancelTopUp,
  getLatestTopUpRequest,
} from '@/modules/top-up/top-up.service';
import { registerBuyer } from '@/modules/buyer/buyer.service';

describe('Buyer Top-Up Status Service', () => {
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
        telegramUsername: 'status_user',
      },
      db
    );
    await setRate({ adminTelegramId: adminId, irrPerUsd: 600000n }, db);
    return { buyer, wallet };
  }

  it('returns null when buyer has never initiated a top-up request', async () => {
    const { buyer } = await createTestBuyer();
    const result = await getLatestTopUpRequest(buyer.id, db);
    expect(result).toBeNull();
  });

  it('returns the active top-up request when present', async () => {
    const { buyer } = await createTestBuyer();
    const { request } = await initiateTopUp(
      {
        userId: buyer.id,
        usdAmount: '50.00',
      },
      db
    );

    const result = await getLatestTopUpRequest(buyer.id, db);
    expect(result).toBeDefined();
    expect(result!.id).toBe(request.id);
    expect(result!.status).toBe('INITIATED');
    expect(result!.usdAmount).toBe('50.00');
  });

  it('returns the most recently created historical request when no active request exists (sorted by createdAt DESC)', async () => {
    const { buyer } = await createTestBuyer();

    // Request 1
    const { request: r1 } = await initiateTopUp({ userId: buyer.id, usdAmount: '20.00' }, db);
    await cancelTopUp({ userId: buyer.id }, db);

    await new Promise((r) => setTimeout(r, 25));

    // Request 2
    const { request: r2 } = await initiateTopUp({ userId: buyer.id, usdAmount: '75.00' }, db);
    await cancelTopUp({ userId: buyer.id }, db);

    const latest = await getLatestTopUpRequest(buyer.id, db);
    expect(latest).toBeDefined();
    expect(latest!.id).toBe(r2.id);
    expect(latest!.usdAmount).toBe('75.00');
    expect(latest!.status).toBe('CANCELLED');
  });
});
