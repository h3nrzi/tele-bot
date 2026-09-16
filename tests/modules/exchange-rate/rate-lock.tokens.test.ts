import { describe, it, expect } from 'vitest';
import { TOKENS } from '@/core/di/tokens';
import type { IRateLockService, LockedRate } from '@/modules/exchange-rate';
import Decimal from 'decimal.js';

describe('Rate Lock Seam Tokens and Types', () => {
  it('defines unique DI tokens for AutoSyncRateLock and ManualRateLock', () => {
    expect(TOKENS.AutoSyncRateLock).toBeDefined();
    expect(TOKENS.ManualRateLock).toBeDefined();
    expect(typeof TOKENS.AutoSyncRateLock).toBe('symbol');
    expect(typeof TOKENS.ManualRateLock).toBe('symbol');
    expect(TOKENS.AutoSyncRateLock).not.toBe(TOKENS.ManualRateLock);
  });

  it('allows implementing IRateLockService and producing LockedRate', async () => {
    const fakeLockedRate: LockedRate = {
      lockedIrrPerUsd: 650000n,
      rateSource: 'MANUAL',
      exchangeRateId: 'test-id',
      exchangeRate: null,
    };

    const service: IRateLockService = {
      async resolve(usdAmount: Decimal): Promise<LockedRate> {
        return fakeLockedRate;
      },
    };

    const result = await service.resolve(new Decimal(100));
    expect(result).toBe(fakeLockedRate);
    expect(result.lockedIrrPerUsd).toBe(650000n);
    expect(result.rateSource).toBe('MANUAL');
    expect(result.exchangeRateId).toBe('test-id');
    expect(result.exchangeRate).toBeNull();
  });
});
