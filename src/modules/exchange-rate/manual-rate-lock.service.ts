import { injectable, inject } from 'tsyringe';
import type Decimal from 'decimal.js';
import { TOKENS } from '@/core/di/tokens';
import type { IExchangeRateRepository } from '@/modules/exchange-rate/exchange-rate.repository.interface';
import type { IRateLockService, LockedRate } from '@/modules/exchange-rate/rate-lock.service.interface';
import { NoExchangeRateError } from '@/modules/exchange-rate/exchange-rate.errors';
import type { DbExecutor } from '@/core/database/types';

/**
 * Manual Rate Lock adapter.
 * Resolves the exchange rate for top-up initiation by querying the latest
 * admin-configured rate from the exchange rate repository.
 */
@injectable()
export class ManualRateLock implements IRateLockService {
  constructor(
    @inject(TOKENS.ExchangeRateRepository)
    private readonly exchangeRateRepo: IExchangeRateRepository<DbExecutor>
  ) {}

  public async resolve(_usdAmount: Decimal): Promise<LockedRate> {
    const rate = await this.exchangeRateRepo.findLatest();
    if (!rate) {
      throw new NoExchangeRateError(
        'No active exchange rate found. Top-up is temporarily unavailable.'
      );
    }

    return {
      lockedIrrPerUsd: rate.irrPerUsd,
      rateSource: 'MANUAL',
      exchangeRateId: rate.id,
      exchangeRate: rate,
    };
  }
}
