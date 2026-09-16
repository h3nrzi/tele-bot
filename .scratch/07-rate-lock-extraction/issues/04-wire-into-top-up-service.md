# 04: Wire adapters into `TopUpService.initiateTopUp`

**What to build:** Replace the 50-line rate-resolution block inside `TopUpService.initiateTopUp` with a three-line dispatch: read the current `ExchangeRateConfig`, select the active adapter (`autoSyncRateLock` or `manualRateLock`), call `rateLock.resolve(usdAmount)`, and use the returned `LockedRate` to populate the `TopUpRequest` insert. Inject both adapters into `TopUpService` at construction time (Option A from the spec). The existing `WallexClient` and `ExchangeRateConfigService` injection fields are retained for backward compatibility. All existing `top-up-initiation.test.ts` cases — AUTO_SYNC OTC_QUOTE, BASELINE_FALLBACK, and MANUAL — pass without modification.

**Blocked by:** 02 — Implement `ManualRateLock` adapter, 03 — Implement `AutoSyncRateLock` adapter

**Status:** completed

- [x] `TopUpService` constructor accepts `autoSyncRateLock: IRateLockService` (injected via `TOKENS.AutoSyncRateLock`) and `manualRateLock: IRateLockService` (injected via `TOKENS.ManualRateLock`)
- [x] The 50-line rate-resolution block in `initiateTopUp` is replaced by: read config, select adapter, call `resolve(validation.amount)`
- [x] The `LockedRate` fields (`lockedIrrPerUsd`, `rateSource`, `exchangeRateId`, `exchangeRate`) are passed directly into the `topUpRepo.insert()` call and the `InitiateTopUpResult` return value
- [x] `WallexClient` and `ExchangeRateConfigService` optional injection fields remain on `TopUpService` (backward compatibility)
- [x] All existing tests in `top-up-initiation.test.ts` pass without modification, including AUTO_SYNC, BASELINE_FALLBACK, and MANUAL cases
- [x] `NoExchangeRateError` continues to propagate out of `initiateTopUp` with the same type
- [x] `InitiateTopUpResult` shape is unchanged
- [x] `TopUpConversation` in the presentation layer requires no changes
