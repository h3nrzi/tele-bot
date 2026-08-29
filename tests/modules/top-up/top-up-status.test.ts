import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { topUpRequests } from '@/modules/top-up/top-up.schema';
import { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import { TopUpService } from '@/modules/top-up/top-up.service';
import { BuyerService } from '@/modules/buyer/buyer.service';

describe('Buyer Top-Up Status Service', () => {
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

  async function seedTestBuyer(telegramChatId = 987654321n) {
    const { buyer, wallet } = await buyerService.register(
      {
        telegramChatId,
        telegramUsername: 'status_user',
      }
    );
    await exchangeRateService.setRate({ adminTelegramId: adminId, irrPerUsd: 600000n });
    return { buyer, wallet };
  }

  it('returns null when buyer has never initiated a top-up request', async () => {
    const { buyer } = await seedTestBuyer();
    const result = await topUpService.getLatestTopUpRequest(buyer.id);
    expect(result).toBeNull();
  });

  it('returns the active top-up request when present', async () => {
    const { buyer } = await seedTestBuyer();
    const { request } = await topUpService.initiateTopUp(
      {
        userId: buyer.id,
        usdAmount: '50.00',
      }
    );

    const result = await topUpService.getLatestTopUpRequest(buyer.id);
    expect(result).toBeDefined();
    expect(result!.id).toBe(request.id);
    expect(result!.status).toBe('INITIATED');
    expect(result!.usdAmount).toBe('50.00');
  });

  it('returns the most recently created historical request when no active request exists (sorted by createdAt DESC)', async () => {
    const { buyer } = await seedTestBuyer();

    // Request 1
    const { request: r1 } = await topUpService.initiateTopUp({ userId: buyer.id, usdAmount: '20.00' });
    await topUpService.cancelTopUp({ userId: buyer.id });

    await new Promise((r) => setTimeout(r, 25));

    // Request 2
    const { request: r2 } = await topUpService.initiateTopUp({ userId: buyer.id, usdAmount: '75.00' });
    await topUpService.cancelTopUp({ userId: buyer.id });

    const latest = await topUpService.getLatestTopUpRequest(buyer.id);
    expect(latest).toBeDefined();
    expect(latest!.id).toBe(r2.id);
    expect(latest!.usdAmount).toBe('75.00');
    expect(latest!.status).toBe('CANCELLED');
  });
});
