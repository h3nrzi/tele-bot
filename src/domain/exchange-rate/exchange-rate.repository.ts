import type { ExchangeRate } from './exchange-rate.entity';

/**
 * Domain Repository Interface for ExchangeRate.
 */
export interface IExchangeRateRepository<TExecutor = unknown> {
  findLatest(executor?: TExecutor): Promise<ExchangeRate | null>;
  insert(
    data: { createdByAdminTelegramId: bigint; irrPerUsd: bigint },
    executor?: TExecutor
  ): Promise<ExchangeRate>;
}
