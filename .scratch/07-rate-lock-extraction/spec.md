Status: ready-for-agent

# Spec: Extract the Rate-Locking Module from TopUpService

## Problem Statement

`TopUpService.initiateTopUp` contains approximately 50 lines of rate-resolution logic that spans three subsystems: the Wallex client (for on-demand OTC Quote fetching), the ExchangeRate repository (for Baseline Rate fallback), and the ExchangeRateConfig service (for Rate Mode detection and Spread application). This logic implements the hybrid on-demand/fallback strategy recorded in ADR-0009, but it lives inline in the middle of the Top-Up initiation method alongside amount validation, IRR computation, and row insertion. As a result:

- Understanding Top-Up initiation requires understanding rate-mode branching across three external dependencies.
- Testing `initiateTopUp` requires a mocked `WallexClient` registered in the DI container even when rate-locking behaviour is not the subject of the test.
- Adding a new Rate Mode or changing the fallback strategy requires editing `TopUpService`, a module whose stated responsibility is Top-Up request lifecycle management.

The deletion test applied to the rate-resolution block: if it were extracted, the complexity would concentrate in the new module — not spread back into callers. It earns its keep.

## Solution

Extract an `IRateLockService` interface with a single method: `resolve(usdAmount: Decimal): Promise<LockedRate>`. Implement two adapters: `AutoSyncRateLock` (encapsulating Wallex OTC Quote fetch + spread application + Baseline Rate fallback, per ADR-0009) and `ManualRateLock` (reads the latest Exchange Rate from the repository). Inject the active adapter into `TopUpService` at construction time. `initiateTopUp` calls `rateLockService.resolve(usdAmount)` and receives a `LockedRate` value object — no Rate Mode branching, no Wallex knowledge, no spread arithmetic. The two adapters justify the seam: one real adapter per Rate Mode, plus an in-memory fake for tests.

## User Stories

1. As a developer reading `TopUpService.initiateTopUp`, I want to see a single `rateLockService.resolve(usdAmount)` call instead of a 50-line Rate Mode branching block, so that the method's purpose is immediately legible.
2. As a developer writing a unit test for `initiateTopUp`, I want to inject a fake `IRateLockService` that returns a fixed `LockedRate`, so that I do not need to register a mock `WallexClient` in the container when testing Top-Up initiation behaviour unrelated to rate locking.
3. As a developer implementing a new Rate Mode, I want to add a new adapter that satisfies `IRateLockService`, so that I do not need to modify `TopUpService`.
4. As a developer, I want the `LockedRate` value object returned by `resolve()` to carry all fields that `initiateTopUp` writes onto the `TopUpRequest` row (`lockedIrrPerUsd`, `rateSource`, `exchangeRateId`, `exchangeRate`), so that `TopUpService` does not need to know which Rate Mode was active in order to persist the request.
5. As a developer, I want the `TopUpRequest` entity's `lockedIrrPerUsd`, `rateSource`, and `exchangeRateId` fields to remain exactly as they are today, so that the database schema, the `InitiateTopUpResult` shape, and all existing test assertions are unchanged.
6. As a developer, I want the `AutoSyncRateLock` adapter to implement the exact hybrid strategy described in ADR-0009: attempt a live Wallex OTC Quote, apply the configured Spread, and fall back to the latest Baseline Rate if the quote fails, so that the architectural decision is preserved and concentrated in one place.
7. As a developer, I want the `ManualRateLock` adapter to read the latest Exchange Rate row from the repository, exactly as the current `MANUAL` branch of `initiateTopUp` does today.
8. As a developer, I want the active `IRateLockService` adapter to be selected at startup based on the current Rate Mode from `ExchangeRateConfig`, so that switching Rate Mode in the UI takes effect on the next Top-Up initiation without restarting the process.
9. As a developer, I want `TopUpService` to continue accepting an optional `WallexClient` and `ExchangeRateConfigService` as injected dependencies for backward compatibility with existing test container setups, even though those dependencies will move into the adapters — until the injection graph is updated.
10. As a developer running the existing `top-up-initiation.test.ts` suite, I want all tests — including the AUTO_SYNC and BASELINE_FALLBACK cases — to continue passing without modification, so that the refactor is demonstrably non-breaking.
11. As a developer, I want the `NoExchangeRateError` that today is thrown when no baseline rate exists to continue to propagate out of `initiateTopUp` with the same type, so that the error contract observed by callers and tests does not change.
12. As a developer, I want the `TopUpConversation` in the presentation layer to continue calling `topUpService.initiateTopUp(input)` with no change to the call signature, so that the presentation layer is untouched.

## Implementation Decisions

- **New interface: `IRateLockService`** — defined in `src/modules/exchange-rate/` (alongside the Exchange Rate subsystem it coordinates):

  ```ts
  interface IRateLockService {
  	resolve(usdAmount: Decimal): Promise<LockedRate>;
  }
  ```

- **New value object: `LockedRate`** — a plain data structure (not a class) carrying the four fields `initiateTopUp` needs:

  ```ts
  interface LockedRate {
  	lockedIrrPerUsd: bigint;
  	rateSource: RateSource; // 'MANUAL' | 'OTC_QUOTE' | 'BASELINE_FALLBACK'
  	exchangeRateId: string | null; // null for OTC_QUOTE
  	exchangeRate: ExchangeRate | null; // null for OTC_QUOTE
  }
  ```

  (`RateSource` is the existing union type already defined in `top-up.schema.ts`.)

- **`AutoSyncRateLock` adapter** — dependencies: `WallexClient`, `IExchangeRateRepository`, `spreadPercent: string`. Implements ADR-0009 exactly:
  1. Calls `wallexClient.getOtcPrice('USDTTMN', 'BUY')`.
  2. Applies `calculateSpreadAdjustedRate(quote.priceIrr, spreadPercent)` — reuses the existing shared utility.
  3. On any error, falls back to `exchangeRateRepo.findLatest()`.
  4. If the fallback also fails (no rate exists), throws `NoExchangeRateError`.
  5. Returns a `LockedRate` with `rateSource: 'OTC_QUOTE'` or `'BASELINE_FALLBACK'` accordingly.

- **`ManualRateLock` adapter** — dependencies: `IExchangeRateRepository`. Reads `exchangeRateRepo.findLatest()`, throws `NoExchangeRateError` if absent, returns a `LockedRate` with `rateSource: 'MANUAL'`.

- **`IRateLockService` is resolved dynamically inside `initiateTopUp`** — because the Rate Mode can change at runtime (Admin taps the Rate Mode toggle), the adapter cannot be selected once at construction time. Instead, `TopUpService.initiateTopUp` reads the current `ExchangeRateConfig` and calls either adapter. Two options for how this dispatch is wired:
  - **Option A (preferred):** Inject both adapters into `TopUpService` (`autoSyncRateLock` and `manualRateLock`); `initiateTopUp` reads the config, then delegates to the appropriate one.
  - **Option B:** Inject a `RateLockResolver` (a factory function or thin module) that reads the config and returns the correct adapter. This adds an extra indirection but keeps `TopUpService` fully free of Rate Mode knowledge.

  The implementing agent should choose Option A unless the added complexity of Rate Mode reading inside `TopUpService` proves disqualifying.

- **`TopUpService.initiateTopUp` after refactor** — the 50-line rate-resolution block is replaced by:

  ```ts
  const config = await this.exchangeRateConfigService.getConfig(client);
  const rateLock = config.isAutoSync() ? this.autoSyncRateLock : this.manualRateLock;
  const lockedRate = await rateLock.resolve(validation.amount);
  ```

  The subsequent `computeIrrAmount(validation.amount, lockedRate.lockedIrrPerUsd)` call and `topUpRepo.insert(...)` call are unchanged.

- **`InitiateTopUpResult` shape** — unchanged. `result.request.lockedIrrPerUsd`, `result.request.rateSource`, `result.request.exchangeRateId`, and `result.exchangeRate` continue to be populated identically.

- **DI token** — add `TOKENS.AutoSyncRateLock` and `TOKENS.ManualRateLock` (or a single `TOKENS.RateLockService`) to `src/core/di/tokens.ts` and register adapters in `registerExchangeRateModule` or a dedicated `registerRateLockModule`.

- **`TopUpService` constructor** — `WallexClient` and `ExchangeRateConfigService` optional injection fields are retained for now to preserve backward compatibility with the existing test container setup. The WallexClient field moves to `AutoSyncRateLock`'s constructor; it remains on `TopUpService` only as long as it is needed there. If the test harness is updated to register adapters directly, the field can be removed.

- **No changes to `top-up.schema.ts`, `top-up-request.entity.ts`, `top-up.repository.ts`, any DTO, or any schema.** The database model is entirely unaffected.

- **No changes to `calculateSpreadAdjustedRate` or `computeIrrAmount`** — both utilities are reused unchanged inside `AutoSyncRateLock`.

- **`ExchangeRateConfigService` stays injected into `TopUpService`** — it is still needed to resolve the Rate Mode at initiation time (Option A dispatch logic). Its presence in `TopUpService`'s constructor is not a leak; it is a required dependency for mode-aware dispatch.

## Testing Decisions

- **What makes a good test:** Call `topUpService.initiateTopUp(input)` and assert on the `TopUpRequest` fields in the result and in the database. To test rate-locking behaviour in isolation, construct `AutoSyncRateLock` or `ManualRateLock` directly with mocked dependencies and call `resolve(amount)`.

- **Modules to test:**
  - `TopUpService.initiateTopUp` — all existing tests in `top-up-initiation.test.ts` must pass unchanged (including the AUTO_SYNC OTC_QUOTE, BASELINE_FALLBACK, and MANUAL cases). The existing pattern of registering a mock `WallexClient` in the container continues to work because `AutoSyncRateLock` resolves `WallexClient` from the same container.
  - `AutoSyncRateLock` — new isolated unit tests:
    - Happy path: Wallex returns a quote → `rateSource: 'OTC_QUOTE'`, spread applied correctly.
    - Fallback: Wallex throws → `rateSource: 'BASELINE_FALLBACK'`, baseline rate used.
    - No baseline rate: Wallex throws and no rate exists → `NoExchangeRateError`.
  - `ManualRateLock` — new isolated unit tests:
    - Happy path: returns latest rate with `rateSource: 'MANUAL'`.
    - No rate exists → `NoExchangeRateError`.

- **Prior art:** `top-up-initiation.test.ts` registers `mockWallexClient` via `container.register(TOKENS.WallexClient, { useValue: mockWallexClient })` then resolves `TopUpService` from the container. This pattern is the structural template for all new and updated tests. The existing `exchange-rate.service.test.ts` and `exchange-rate-config.service.test.ts` in `tests/modules/exchange-rate/` are prior art for testing Exchange Rate subsystem modules in isolation.

## Out of Scope

- Changing the Rate Mode toggle flow in `rate-mode.handler.ts` or `BaselineRateSyncWorker`.
- Changing `top-up.schema.ts`, `top-up-request.entity.ts`, or any database migration.
- Changing the `InitiateTopUpResult` DTO shape or any other `TopUpService` method.
- Changing the Top-Up approval, rejection, cancellation, or receipt-submission flows.
- Extracting rate-locking for any purpose other than `initiateTopUp` (e.g., the `syncBaselineRate` worker is out of scope).
- The Order lifecycle notifier refactor (candidate 1).
- The bot bootstrap deepening (candidate 2).
- The OTC Purchase notifier seam fix (candidate 3).

## Further Notes

- ADR-0009 records the hybrid on-demand OTC Quote + periodic Baseline Rate fallback as an architectural decision. This refactor implements that decision in a dedicated module rather than spreading it inline through `TopUpService`. The ADR does not need to be amended; the extract is consistent with it.
- The two adapters satisfy the "one adapter = hypothetical seam, two adapters = real seam" principle: `AutoSyncRateLock` is used in production with AUTO_SYNC mode, `ManualRateLock` is used in production with MANUAL mode, and a `FakeRateLock` (returns a fixed `LockedRate`) is usable in tests. Three concrete implementations across two production modes and one test mode confirm the seam is real.
- The `customLimits?: TopUpLimits` optional parameter on `initiateTopUp` and the `resolveUserId` private helper are both unaffected.
- If Option A (injecting both adapters into `TopUpService`) results in a constructor with too many parameters, Option B (a `RateLockResolver` that returns the correct adapter for a given `ExchangeRateConfig`) should be preferred. The implementing agent has discretion here.
