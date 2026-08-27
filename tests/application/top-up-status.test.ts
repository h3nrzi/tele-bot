import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { topUpRequests } from '@/db/schema/top-up-requests';
import { setRate } from '@/application/exchange-rate/exchange-rate.service';
import {
  initiateTopUp,
  cancelTopUp,
  getLatestTopUpRequest,
} from '@/application/top-up/top-up.service';
import { registerBuyer } from '@/application/buyer/registration.service';

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
        telegramUsername: 'test_buyer',
      },
      db
    );
    return { buyer, wallet };
  }

  it('returns null for a Buyer with no requests', async () => {
    const { buyer } = await createTestBuyer();

    const result = await getLatestTopUpRequest(buyer.id, db);
    expect(result).toBeNull();
  });

  it('returns most recent request for a Buyer with one request', async () => {
    const { buyer } = await createTestBuyer();
    await setRate(adminId, 620000n, db);

    const initResult = await initiateTopUp({ userId: buyer.id, usdAmount: '50.00' }, db);

    const result = await getLatestTopUpRequest(buyer.id, db);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(initResult.request.id);
    expect(result?.status).toBe('INITIATED');
    expect(result?.usdAmount).toBe('50.00');
  });

  it('returns most recent request for a Buyer with multiple historical requests', async () => {
    const { buyer } = await createTestBuyer();
    await setRate(adminId, 620000n, db);

    // Request 1: Initiated then Cancelled
    const req1 = await initiateTopUp({ userId: buyer.id, usdAmount: '20.00' }, db);
    await cancelTopUp({ userId: buyer.id }, db);

    // Request 2: New initiation
    const req2 = await initiateTopUp({ userId: buyer.id, usdAmount: '100.00' }, db);

    const result = await getLatestTopUpRequest(buyer.id, db);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(req2.request.id);
    expect(result?.usdAmount).toBe('100.00');
    expect(result?.status).toBe('INITIATED');
  });
});
