# 01: Define `IRateLockService`, `LockedRate`, and DI tokens

**What to build:** Introduce the shared vocabulary for the rate-locking seam. Define the `IRateLockService` interface (single `resolve(usdAmount)` method returning `Promise<LockedRate>`) and the `LockedRate` plain-data value object (four fields: `lockedIrrPerUsd`, `rateSource`, `exchangeRateId`, `exchangeRate`). Add two new DI tokens — `AutoSyncRateLock` and `ManualRateLock` — to the central token registry. No adapter implementations, no wiring into `TopUpService`, no runtime behaviour changes. All existing tests must pass after this ticket lands.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] `IRateLockService` interface is defined in `src/modules/exchange-rate/` with a single method `resolve(usdAmount: Decimal): Promise<LockedRate>`
- [x] `LockedRate` plain-data interface is defined alongside `IRateLockService`, carrying `lockedIrrPerUsd: bigint`, `rateSource: RateSource`, `exchangeRateId: string | null`, and `exchangeRate: ExchangeRate | null`
- [x] `TOKENS.AutoSyncRateLock` and `TOKENS.ManualRateLock` are added to `src/core/di/tokens.ts`
- [x] No existing test is broken by these additions
