# 02: Implement `ManualRateLock` adapter (with tests)

**What to build:** A `ManualRateLock` class that satisfies `IRateLockService`. Its `resolve(usdAmount)` method reads the latest Exchange Rate row from `IExchangeRateRepository`; if none exists, it throws `NoExchangeRateError`; otherwise it returns a `LockedRate` with `rateSource: 'MANUAL'`, the row's `irrPerUsd`, and the full `ExchangeRate` entity. The adapter is registered under `TOKENS.ManualRateLock` in the Exchange Rate module's DI registration. Two isolated unit tests ship alongside: happy path and `NoExchangeRateError`.

**Blocked by:** 01 — Define `IRateLockService`, `LockedRate`, and DI tokens

**Status:** completed

- [x] `ManualRateLock` class is created in `src/modules/exchange-rate/` and implements `IRateLockService`
- [x] `resolve()` calls `exchangeRateRepo.findLatest()`; throws `NoExchangeRateError` when the result is null
- [x] `resolve()` returns a `LockedRate` with `rateSource: 'MANUAL'`, correct `lockedIrrPerUsd`, `exchangeRateId`, and `exchangeRate`
- [x] `ManualRateLock` is registered in the Exchange Rate module's DI setup under `TOKENS.ManualRateLock`
- [x] Unit test: happy path — returns correct `LockedRate` with `rateSource: 'MANUAL'`
- [x] Unit test: no rate exists — throws `NoExchangeRateError`
- [x] All existing tests continue to pass
