import { injectable, inject } from 'tsyringe';
import type Decimal from 'decimal.js';
import { TOKENS } from '@/core/di/tokens';
import type { WallexClient } from '@/modules/wallex/wallex.client.interface';
import type { IExchangeRateRepository } from '@/modules/exchange-rate/exchange-rate.repository.interface';
import type { IRateLockService, LockedRate } from '@/modules/exchange-rate/rate-lock.service.interface';
import { NoExchangeRateError } from '@/modules/exchange-rate/exchange-rate.errors';
import { calculateSpreadAdjustedRate } from '@/core/shared/currency.utils';
import type { DbExecutor } from '@/core/database/types';

/**
 * Auto-Sync Rate Lock adapter.
 * Implements the hybrid on-demand OTC quote with periodic baseline fallback
 * strategy recorded in ADR-0009.
 */
@injectable()
export class AutoSyncRateLock implements IRateLockService {
  constructor(
    @inject(TOKENS.WallexClient)
    private readonly wallexClient: WallexClient,
    @inject(TOKENS.ExchangeRateRepository)
    private readonly exchangeRateRepo: IExchangeRateRepository<DbExecutor>,
    private readonly spreadPercent: string = '0.00'
  ) {}

  public async resolve(_usdAmount: Decimal): Promise<LockedRate> {
    try {
      const quote = await this.wallexClient.getOtcPrice('USDTTMN', 'BUY');
      if (quote && typeof quote.priceIrr === 'bigint' && quote.priceIrr > 0n) {
        const lockedIrrPerUsd = calculateSpreadAdjustedRate(
          quote.priceIrr,
          this.spreadPercent
        );
        return {
          lockedIrrPerUsd,
          rateSource: 'OTC_QUOTE',
          exchangeRateId: null,
          exchangeRate: null,
        };
      }
    } catch {
      // On any Wallex error, fall back to baseline rate
    }

    const baselineRate = await this.exchangeRateRepo.findLatest();
    if (!baselineRate) {
      throw new NoExchangeRateError(
        'No active exchange rate found. Top-up is temporarily unavailable.'
      );
    }

    return {
      lockedIrrPerUsd: baselineRate.irrPerUsd,
      rateSource: 'BASELINE_FALLBACK',
      exchangeRateId: baselineRate.id,
      exchangeRate: baselineRate,
    };
  }
}
