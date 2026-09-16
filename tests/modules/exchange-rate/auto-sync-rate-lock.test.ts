import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import { container } from 'tsyringe';
import { AutoSyncRateLock } from '@/modules/exchange-rate/auto-sync-rate-lock.service';
import type { WallexClient } from '@/modules/wallex/wallex.client.interface';
import type { IExchangeRateRepository } from '@/modules/exchange-rate/exchange-rate.repository.interface';
import { ExchangeRate } from '@/modules/exchange-rate/exchange-rate.entity';
import { NoExchangeRateError } from '@/modules/exchange-rate/exchange-rate.errors';
import { WallexNetworkError } from '@/modules/wallex/wallex.errors';
import { registerExchangeRateModule } from '@/modules/exchange-rate/exchange-rate.module';
import { TOKENS } from '@/core/di/tokens';
import type { IRateLockService } from '@/modules/exchange-rate/rate-lock.service.interface';

describe('AutoSyncRateLock Adapter', () => {
  let mockWallexClient: {
    getOtcPrice: ReturnType<typeof vi.fn>;
    placeOtcOrder: ReturnType<typeof vi.fn>;
  };
  let mockExchangeRateRepo: {
    findLatest: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
  };

  const dummyBaselineRate = new ExchangeRate({
    id: 'baseline-rate-uuid-456',
    irrPerUsd: 600000n,
    createdByAdminTelegramId: 112233n,
    createdAt: new Date('2026-03-01T10:00:00Z'),
  });

  beforeEach(() => {
    mockWallexClient = {
      getOtcPrice: vi.fn(),
      placeOtcOrder: vi.fn(),
    };
    mockExchangeRateRepo = {
      findLatest: vi.fn(),
      insert: vi.fn(),
    };
  });

  it('happy path: OTC_QUOTE — Wallex returns valid quote, spread is applied, and correct LockedRate returned', async () => {
    const autoSyncRateLock = new AutoSyncRateLock(
      mockWallexClient as unknown as WallexClient,
      mockExchangeRateRepo as unknown as IExchangeRateRepository,
      '1.50'
    );

    mockWallexClient.getOtcPrice.mockResolvedValue({
      symbol: 'USDTTMN',
      side: 'BUY',
      priceIrr: 905000n,
    });

    const lockedRate = await autoSyncRateLock.resolve(new Decimal(100));

    expect(mockWallexClient.getOtcPrice).toHaveBeenCalledWith('USDTTMN', 'BUY');
    expect(mockExchangeRateRepo.findLatest).not.toHaveBeenCalled();

    // 905,000 * (1 + 1.50 / 100) = 905,000 * 1.015 = 918,575
    expect(lockedRate).toEqual({
      lockedIrrPerUsd: 918575n,
      rateSource: 'OTC_QUOTE',
      exchangeRateId: null,
      exchangeRate: null,
    });
  });

  it('fallback path: BASELINE_FALLBACK — Wallex throws, falls back to latest baseline rate', async () => {
    const autoSyncRateLock = new AutoSyncRateLock(
      mockWallexClient as unknown as WallexClient,
      mockExchangeRateRepo as unknown as IExchangeRateRepository,
      '2.00'
    );

    mockWallexClient.getOtcPrice.mockRejectedValue(
      new WallexNetworkError('Wallex OTC endpoint unreachable')
    );
    mockExchangeRateRepo.findLatest.mockResolvedValue(dummyBaselineRate);

    const lockedRate = await autoSyncRateLock.resolve(new Decimal(50));

    expect(mockWallexClient.getOtcPrice).toHaveBeenCalledWith('USDTTMN', 'BUY');
    expect(mockExchangeRateRepo.findLatest).toHaveBeenCalledTimes(1);

    expect(lockedRate).toEqual({
      lockedIrrPerUsd: 600000n,
      rateSource: 'BASELINE_FALLBACK',
      exchangeRateId: 'baseline-rate-uuid-456',
      exchangeRate: dummyBaselineRate,
    });
  });

  it('no-rate path: both sources fail — Wallex throws and findLatest returns null, throws NoExchangeRateError', async () => {
    const autoSyncRateLock = new AutoSyncRateLock(
      mockWallexClient as unknown as WallexClient,
      mockExchangeRateRepo as unknown as IExchangeRateRepository,
      '1.00'
    );

    mockWallexClient.getOtcPrice.mockRejectedValue(
      new WallexNetworkError('Wallex down')
    );
    mockExchangeRateRepo.findLatest.mockResolvedValue(null);

    await expect(autoSyncRateLock.resolve(new Decimal(100))).rejects.toThrow(
      NoExchangeRateError
    );
    expect(mockWallexClient.getOtcPrice).toHaveBeenCalledWith('USDTTMN', 'BUY');
    expect(mockExchangeRateRepo.findLatest).toHaveBeenCalledTimes(1);
  });

  describe('DI Registration', () => {
    it('resolves AutoSyncRateLock from TOKENS.AutoSyncRateLock in isolation', () => {
      const childContainer = container.createChildContainer();
      registerExchangeRateModule(childContainer);
      childContainer.register(TOKENS.WallexClient, { useValue: {} });
      childContainer.register(TOKENS.ExchangeRateRepository, { useValue: {} });

      const resolved = childContainer.resolve<IRateLockService>(TOKENS.AutoSyncRateLock);
      expect(resolved).toBeDefined();
      expect(resolved).toBeInstanceOf(AutoSyncRateLock);
    });
  });
});
