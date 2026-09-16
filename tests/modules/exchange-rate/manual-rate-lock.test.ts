import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import { container } from 'tsyringe';
import { ManualRateLock } from '@/modules/exchange-rate/manual-rate-lock.service';
import type { IExchangeRateRepository } from '@/modules/exchange-rate/exchange-rate.repository.interface';
import { ExchangeRate } from '@/modules/exchange-rate/exchange-rate.entity';
import { NoExchangeRateError } from '@/modules/exchange-rate/exchange-rate.errors';
import { registerExchangeRateModule } from '@/modules/exchange-rate/exchange-rate.module';
import { TOKENS } from '@/core/di/tokens';
import type { IRateLockService } from '@/modules/exchange-rate/rate-lock.service.interface';

describe('ManualRateLock Adapter', () => {
  let mockExchangeRateRepo: {
    findLatest: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
  };
  let manualRateLock: ManualRateLock;

  const dummyRate = new ExchangeRate({
    id: 'rate-uuid-123',
    irrPerUsd: 650000n,
    createdByAdminTelegramId: 999888n,
    createdAt: new Date('2026-03-01T12:00:00Z'),
  });

  beforeEach(() => {
    mockExchangeRateRepo = {
      findLatest: vi.fn(),
      insert: vi.fn(),
    };
    manualRateLock = new ManualRateLock(
      mockExchangeRateRepo as unknown as IExchangeRateRepository
    );
  });

  it('happy path: returns correct LockedRate with rateSource MANUAL when rate exists', async () => {
    mockExchangeRateRepo.findLatest.mockResolvedValue(dummyRate);

    const lockedRate = await manualRateLock.resolve(new Decimal(100));

    expect(mockExchangeRateRepo.findLatest).toHaveBeenCalledTimes(1);
    expect(lockedRate).toEqual({
      lockedIrrPerUsd: 650000n,
      rateSource: 'MANUAL',
      exchangeRateId: 'rate-uuid-123',
      exchangeRate: dummyRate,
    });
  });

  it('no rate exists: throws NoExchangeRateError when findLatest returns null', async () => {
    mockExchangeRateRepo.findLatest.mockResolvedValue(null);

    await expect(manualRateLock.resolve(new Decimal(50))).rejects.toThrow(
      NoExchangeRateError
    );
    expect(mockExchangeRateRepo.findLatest).toHaveBeenCalledTimes(1);
  });

  describe('DI Registration', () => {
    it('resolves ManualRateLock from TOKENS.ManualRateLock in isolation', () => {
      const childContainer = container.createChildContainer();
      registerExchangeRateModule(childContainer);
      childContainer.register(TOKENS.ExchangeRateRepository, { useValue: {} });

      const resolved = childContainer.resolve<IRateLockService>(TOKENS.ManualRateLock);
      expect(resolved).toBeDefined();
      expect(resolved).toBeInstanceOf(ManualRateLock);
    });
  });
});
