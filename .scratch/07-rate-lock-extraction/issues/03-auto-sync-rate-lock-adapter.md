# 03: Implement `AutoSyncRateLock` adapter (with tests)

**What to build:** An `AutoSyncRateLock` class that satisfies `IRateLockService` and implements the hybrid on-demand/fallback strategy from ADR-0009. Its `resolve(usdAmount)` method attempts a live Wallex OTC Quote via `wallexClient.getOtcPrice('USDTTMN', 'BUY')`, applies `calculateSpreadAdjustedRate` with the configured `spreadPercent`, and returns a `LockedRate` with `rateSource: 'OTC_QUOTE'`. On any Wallex error it falls back to `exchangeRateRepo.findLatest()`, returning `rateSource: 'BASELINE_FALLBACK'`. If the fallback also yields no rate, it throws `NoExchangeRateError`. The adapter is registered under `TOKENS.AutoSyncRateLock` in the Exchange Rate module's DI registration. Three isolated unit tests ship alongside.

**Blocked by:** 01 — Define `IRateLockService`, `LockedRate`, and DI tokens

**Status:** completed

- [x] `AutoSyncRateLock` class is created in `src/modules/exchange-rate/` and implements `IRateLockService`
- [x] Dependencies: `WallexClient`, `IExchangeRateRepository`, `spreadPercent: string`
- [x] Happy path: Wallex returns a valid quote → applies spread → returns `LockedRate` with `rateSource: 'OTC_QUOTE'`, `exchangeRateId: null`, `exchangeRate: null`
- [x] Fallback path: Wallex throws → reads `findLatest()` → returns `LockedRate` with `rateSource: 'BASELINE_FALLBACK'`, correct entity fields
- [x] No-rate path: Wallex throws and `findLatest()` returns null → throws `NoExchangeRateError`
- [x] `AutoSyncRateLock` is registered in the Exchange Rate module's DI setup under `TOKENS.AutoSyncRateLock`
- [x] Unit test: OTC_QUOTE happy path — spread applied, correct `LockedRate` returned
- [x] Unit test: BASELINE_FALLBACK — Wallex throws, baseline rate returned
- [x] Unit test: both sources fail — `NoExchangeRateError` thrown
- [x] All existing tests continue to pass
