import type { ExchangeRateConfig, RateMode } from "./exchange-rate-config.entity";

export interface UpsertExchangeRateConfigData {
	mode?: RateMode | undefined;
	spreadPercent?: string | undefined;
	syncIntervalMinutes?: number | undefined;
	updatedByAdminTelegramId?: bigint | null | undefined;
}

export interface IExchangeRateConfigRepository<TExecutor = unknown> {
	/**
	 * Finds the singleton ExchangeRateConfig, or null if no row exists yet.
	 */
	find(executor?: TExecutor): Promise<ExchangeRateConfig | null>;

	/**
	 * Upserts the singleton ExchangeRateConfig row.
	 * If a row exists, updates it. If not, inserts a new singleton row with defaults.
	 */
	upsert(data: UpsertExchangeRateConfigData, executor?: TExecutor): Promise<ExchangeRateConfig>;
}
