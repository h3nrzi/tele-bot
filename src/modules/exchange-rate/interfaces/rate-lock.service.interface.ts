import type Decimal from "decimal.js";
import type { UsdAmount } from "@/core/shared/money.vo";
import type { RateSource } from "@/modules/top-up/top-up.schema";
import type { ExchangeRate } from "@/modules/exchange-rate/entities/exchange-rate.entity";

/**
 * Plain-data value object returned by IRateLockService.
 * Carries all fields needed to populate a TopUpRequest row at initiation time.
 */
export interface LockedRate {
	lockedIrrPerUsd: bigint;
	rateSource: RateSource;
	exchangeRateId: string | null;
	exchangeRate: ExchangeRate | null;
}

/**
 * Interface for rate-locking services.
 * Resolves the exchange rate to lock for a given USD amount during top-up initiation.
 */
export interface IRateLockService {
	resolve(usdAmount: Decimal | UsdAmount, spreadPercent?: string): Promise<LockedRate>;
}
