import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { users } from '@/modules/buyer/buyer.schema';
import { topUpRequests } from '@/modules/top-up/top-up.schema';
import { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import { ExchangeRateConfigService } from '@/modules/exchange-rate/exchange-rate-config.service';
import { TopUpService } from '@/modules/top-up/top-up.service';
import {
  ActiveTopUpRequestExistsError,
  InvalidTopUpAmountError,
} from '@/modules/top-up/top-up.errors';
import { NoExchangeRateError } from '@/modules/exchange-rate/exchange-rate.errors';
import type { WallexClient } from '@/modules/wallex/wallex.client.interface';
import { WallexNetworkError } from '@/modules/wallex/wallex.errors';
import { TOKENS } from '@/core/di/tokens';
import { eq } from 'drizzle-orm';
import Decimal from 'decimal.js';

describe('Top-Up Initiation Service', () => {
  const { db, container } = setupTestDatabase();
  let topUpService: TopUpService;
  let exchangeRateService: ExchangeRateService;
  let exchangeRateConfigService: ExchangeRateConfigService;
  let mockWallexClient: WallexClient;
  const adminId = 123456789n;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.TOPUP_MIN_USD = '10.00';
    process.env.TOPUP_MAX_USD = '1000.00';
    process.env.TOPUP_INITIATED_EXPIRY_MINUTES = '30';

    mockWallexClient = {
      getOtcPrice: vi.fn(),
      placeOtcOrder: vi.fn(),
    };
    container.register(TOKENS.WallexClient, { useValue: mockWallexClient });

    topUpService = container.resolve(TopUpService);
    exchangeRateService = container.resolve(ExchangeRateService);
    exchangeRateConfigService = container.resolve(ExchangeRateConfigService);
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

    const rate = await exchangeRateService.setRate({ adminTelegramId: adminId, irrPerUsd: 600000n });

    return { user: user!, rate };
  }

  it('initiates a top-up request with valid amount and calculates IRR amount accurately', async () => {
    const { user, rate } = await seedPrerequisites();

    const result = await topUpService.initiateTopUp(
      {
        userId: user.id,
        usdAmount: '50.00',
      }
    );

    expect(result).toBeDefined();
    expect(result.request).toBeDefined();
    expect(result.request.userId).toBe(user.id);
    expect(result.request.usdAmount).toBe('50.00');
    expect(result.request.irrAmount).toBe(30000000n); // 50 * 600,000
    expect(result.request.lockedIrrPerUsd).toBe(600000n);
    expect(result.request.rateSource).toBe('MANUAL');
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
    expect(row!.lockedIrrPerUsd).toBe(600000n);
    expect(row!.rateSource).toBe('MANUAL');
    expect(row!.exchangeRateId).toBe(rate.id);
  });

  it('rejects initiation if Buyer already has an active INITIATED request', async () => {
    const { user } = await seedPrerequisites();

    await topUpService.initiateTopUp({ userId: user.id, usdAmount: '50.00' });

    await expect(
      topUpService.initiateTopUp({ userId: user.id, usdAmount: '100.00' })
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
      topUpService.initiateTopUp({ userId: user!.id, usdAmount: '50.00' })
    ).rejects.toThrow(NoExchangeRateError);
  });

  it('throws InvalidTopUpAmountError when amount is below configured minimum', async () => {
    const { user } = await seedPrerequisites();

    await expect(
      topUpService.initiateTopUp({ userId: user.id, usdAmount: '5.00' })
    ).rejects.toThrow(InvalidTopUpAmountError);
  });

  it('throws InvalidTopUpAmountError when amount is above configured maximum', async () => {
    const { user } = await seedPrerequisites();

    await expect(
      topUpService.initiateTopUp({ userId: user.id, usdAmount: '1500.00' })
    ).rejects.toThrow(InvalidTopUpAmountError);
  });

  it('throws InvalidTopUpAmountError on non-numeric or negative amount', async () => {
    const { user } = await seedPrerequisites();

    await expect(
      topUpService.initiateTopUp({ userId: user.id, usdAmount: '-10.00' })
    ).rejects.toThrow(InvalidTopUpAmountError);

    await expect(
      topUpService.initiateTopUp({ userId: user.id, usdAmount: 'invalid' })
    ).rejects.toThrow(InvalidTopUpAmountError);
  });

  it('calculates expires_at based on TOPUP_INITIATED_EXPIRY_MINUTES', async () => {
    const { user } = await seedPrerequisites();
    process.env.TOPUP_INITIATED_EXPIRY_MINUTES = '45';

    const before = Date.now();
    const { request } = await topUpService.initiateTopUp(
      { userId: user.id, usdAmount: '50.00' }
    );
    const after = Date.now();

    const expectedMinMs = before + 45 * 60 * 1000;
    const expectedMaxMs = after + 45 * 60 * 1000;

    expect(request.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMinMs);
    expect(request.expiresAt.getTime()).toBeLessThanOrEqual(expectedMaxMs);
  });

  it('returns active top-up request with getActiveTopUpRequest', async () => {
    const { user } = await seedPrerequisites();

    const notFound = await topUpService.getActiveTopUpRequest(user.id);
    expect(notFound).toBeNull();

    const created = await topUpService.initiateTopUp(
      { userId: user.id, usdAmount: '75.00' }
    );

    const active = await topUpService.getActiveTopUpRequest(user.id);
    expect(active).toBeDefined();
    expect(active!.id).toBe(created.request.id);
    expect(active!.status).toBe('INITIATED');
  });

  describe('AUTO_SYNC Rate Mode', () => {
    it('initiates top-up with on-demand OTC quote, applies spread, and stores rate_source = OTC_QUOTE with null exchange_rate_id', async () => {
      const { user } = await seedPrerequisites();
      await exchangeRateConfigService.updateConfig({
        mode: 'AUTO_SYNC',
        spreadPercent: '1.50',
      });

      (mockWallexClient.getOtcPrice as any).mockResolvedValue({
        symbol: 'USDTTMN',
        side: 'BUY',
        priceIrr: 905000n,
      });

      const result = await topUpService.initiateTopUp({
        userId: user.id,
        usdAmount: '100.00',
      });

      // 905,000 * (1 + 1.50 / 100) = 905,000 * 1.015 = 918,575
      expect(result.request.lockedIrrPerUsd).toBe(918575n);
      expect(result.request.rateSource).toBe('OTC_QUOTE');
      expect(result.request.exchangeRateId).toBeNull();
      expect(result.exchangeRate).toBeNull();
      // 100.00 * 918,575 = 91,857,500
      expect(result.request.irrAmount).toBe(91857500n);
      expect(result.request.status).toBe('INITIATED');

      expect(mockWallexClient.getOtcPrice).toHaveBeenCalledWith('USDTTMN', 'BUY');

      // Verify in DB
      const [row] = await db
        .select()
        .from(topUpRequests)
        .where(eq(topUpRequests.id, result.request.id));
      expect(row).toBeDefined();
      expect(row!.lockedIrrPerUsd).toBe(918575n);
      expect(row!.rateSource).toBe('OTC_QUOTE');
      expect(row!.exchangeRateId).toBeNull();
      expect(row!.irrAmount).toBe(91857500n);
      expect(row!.usdAmount).toBe('100.00');
    });

    it('falls back to latest baseline rate when OTC quote fetch fails', async () => {
      const { user, rate: baselineRate } = await seedPrerequisites();
      await exchangeRateConfigService.updateConfig({
        mode: 'AUTO_SYNC',
        spreadPercent: '2.00',
      });

      (mockWallexClient.getOtcPrice as any).mockRejectedValue(
        new WallexNetworkError('Wallex OTC endpoint unreachable')
      );

      const result = await topUpService.initiateTopUp({
        userId: user.id,
        usdAmount: '100.00',
      });

      // Sourced from baseline exchange rate row (600,000 IRR)
      expect(result.request.lockedIrrPerUsd).toBe(600000n);
      expect(result.request.rateSource).toBe('BASELINE_FALLBACK');
      expect(result.request.exchangeRateId).toBe(baselineRate.id);
      expect(result.exchangeRate).toBeDefined();
      expect(result.exchangeRate!.id).toBe(baselineRate.id);
      expect(result.request.irrAmount).toBe(60000000n);

      // Verify in DB
      const [row] = await db
        .select()
        .from(topUpRequests)
        .where(eq(topUpRequests.id, result.request.id));
      expect(row).toBeDefined();
      expect(row!.lockedIrrPerUsd).toBe(600000n);
      expect(row!.rateSource).toBe('BASELINE_FALLBACK');
      expect(row!.exchangeRateId).toBe(baselineRate.id);
      expect(row!.irrAmount).toBe(60000000n);
    });

    it('falls back to latest baseline rate when OTC quote returns zero or negative price', async () => {
      const { user, rate: baselineRate } = await seedPrerequisites();

      await exchangeRateConfigService.updateConfig({
        mode: 'AUTO_SYNC',
        spreadPercent: '2.00',
      });

      (mockWallexClient.getOtcPrice as any).mockResolvedValue({
        symbol: 'USDTTMN',
        side: 'BUY',
        priceIrr: 0n,
      });

      const result = await topUpService.initiateTopUp({
        userId: user.id,
        usdAmount: '100.00',
      });

      expect(result.request.lockedIrrPerUsd).toBe(baselineRate.irrPerUsd);
      expect(result.request.rateSource).toBe('BASELINE_FALLBACK');
      expect(result.request.exchangeRateId).toBe(baselineRate.id);
    });

    it('throws NoExchangeRateError when OTC quote fails and no baseline rate exists', async () => {
      const [user] = await db
        .insert(users)
        .values({
          telegramChatId: 778899n,
          telegramUsername: 'nobaselineuser',
        })
        .returning();

      await exchangeRateConfigService.updateConfig({
        mode: 'AUTO_SYNC',
        spreadPercent: '1.00',
      });

      (mockWallexClient.getOtcPrice as any).mockRejectedValue(
        new WallexNetworkError('Wallex down')
      );

      await expect(
        topUpService.initiateTopUp({ userId: user!.id, usdAmount: '50.00' })
      ).rejects.toThrow(NoExchangeRateError);
    });

    it('uses Decimal precision for spread calculation on complex fractional amounts', async () => {
      const { user } = await seedPrerequisites();
      await exchangeRateConfigService.updateConfig({
        mode: 'AUTO_SYNC',
        spreadPercent: '2.33',
      });

      (mockWallexClient.getOtcPrice as any).mockResolvedValue({
        symbol: 'USDTTMN',
        side: 'BUY',
        priceIrr: 915000n,
      });

      const result = await topUpService.initiateTopUp({
        userId: user.id,
        usdAmount: '33.33',
      });

      // 915,000 * (1 + 2.33 / 100) = 915,000 * 1.0233 = 936,319.5 -> rounds to 936,320
      expect(result.request.lockedIrrPerUsd).toBe(936320n);
      expect(result.request.rateSource).toBe('OTC_QUOTE');
      // 33.33 * 936,320 = 31,207,545.6 -> rounds to 31,207,546
      expect(result.request.irrAmount).toBe(31207546n);
    });
  });
});
