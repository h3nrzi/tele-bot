Status: ready-for-agent

# Spec: Stiffen the OTC Purchase Notifier Seam

## Problem Statement

`OtcPurchaseService` currently receives its `IOtcPurchaseNotifier` dependency via two independent paths: constructor injection (through the DI container's `TOKENS.OtcPurchaseNotifier` token) and a public mutable `setNotifier()` method called imperatively in `bot.ts` after the service has already been resolved. The two paths coexist because `TelegramOtcPurchaseNotifier` requires a live `bot.api` reference, which is only available after the `Bot` instance is constructed — which happens after the DI container has already been created. As a result, `bot.ts` creates the notifier, registers it into the container, resolves the service, and then calls `setNotifier()` again as a belt-and-suspenders measure. This leaves the service with a mutable `defaultNotifier` field, a public `getNotifier()` accessor, and an ambiguous interface: it is unclear which of the two injection paths will win, or in what order they are executed. A consumer of `OtcPurchaseService` cannot determine the service's notifier state from its construction alone.

## Solution

Eliminate the `setNotifier()` / `getNotifier()` methods and the associated mutable `defaultNotifier` field from `OtcPurchaseService`. The notifier is registered into the DI container **before** `OtcPurchaseService` is resolved. Constructor injection becomes the single, canonical path. In `bot.ts`, the `TelegramOtcPurchaseNotifier` is instantiated immediately after the `Bot` instance is created and registered against `TOKENS.OtcPurchaseNotifier` before any service resolution call. This is the same registration order pattern already established by other tokens in the container.

## User Stories

1. As a developer reading `OtcPurchaseService`, I want to see the notifier declared as a single constructor parameter, so that the service's full dependency set is visible at a glance without searching for post-construction mutation.
2. As a developer, I want `OtcPurchaseService` to have no public `setNotifier()` method, so that the service's notifier is immutable after construction and cannot be accidentally overwritten at runtime.
3. As a developer, I want `OtcPurchaseService` to have no public `getNotifier()` method, so that the service does not expose implementation state that callers have no business querying.
4. As a developer writing a test for `OtcPurchaseService`, I want to inject a mock `IOtcPurchaseNotifier` at construction time (via the options object or constructor parameter), so that I do not need to call `setNotifier()` after instantiation.
5. As a developer reading `bot.ts`, I want the `TelegramOtcPurchaseNotifier` registration to appear before the first service resolution that depends on it, so that the dependency graph is legible from top to bottom.
6. As a developer, I want the ordering guarantee that when `OtcPurchaseService` is resolved from the container, its notifier is already registered, so that the service is fully initialised at the moment of resolution with no subsequent mutation required.
7. As a developer, I want the `OtcPurchaseServiceOptions` object (the named-options constructor path) to continue accepting an optional `notifier` field, so that tests that construct the service directly keep working.
8. As a developer running the existing `otc-purchase.service.test.ts` suite, I want all tests to continue passing without modification, so that this refactor is demonstrably non-breaking.
9. As a developer, I want the `OtcPurchaseServiceDependencies` per-call `notifier?` / `notifySuccess?` / `notifyFailure?` callbacks on `execute()` and `retry()` to remain available, so that callers that provide per-call overrides (as the existing test suite does) continue to work.

## Implementation Decisions

- **`OtcPurchaseService` constructor** — the `notifier?: IOtcPurchaseNotifier` parameter is retained in both the named-options path (`OtcPurchaseServiceOptions.notifier`) and the positional DI path (the third constructor parameter decorated with `@inject(TOKENS.OtcPurchaseNotifier)`). The field it populates changes from `private defaultNotifier?: IOtcPurchaseNotifier` to `private readonly notifier?: IOtcPurchaseNotifier` — immutable after construction.

- **Methods removed from `OtcPurchaseService`** — `setNotifier(notifier: IOtcPurchaseNotifier): void` and `getNotifier(): IOtcPurchaseNotifier | undefined` are deleted. Nothing in the codebase other than `bot.ts` calls these methods; the deletion is safe once `bot.ts`'s wiring is fixed.

- **`bot.ts` registration order** — the current sequence is:
  1. Create `Bot<BotContext>` instance
  2. Construct `TelegramOtcPurchaseNotifier({ api: bot.api, … })`
  3. `appContainer.register(TOKENS.OtcPurchaseNotifier, { useValue: otcNotifier })`
  4. Conditionally resolve `OtcPurchaseService` and call `otcService.setNotifier(otcNotifier)` ← **this block is deleted**

  After the refactor, steps 1–3 remain. Step 4 is removed entirely. Because `TOKENS.OtcPurchaseNotifier` is already registered before any service is resolved (the composers call `container.resolve(OtcPurchaseService)` later, inside `createAdminComposer`), the constructor injection fires correctly.

- **`OtcPurchaseServiceDependencies` per-call interface** — unchanged. The `execute()` and `retry()` methods continue to accept optional per-call `notifySuccess` / `notifyFailure` / `notifier` overrides. The internal `sendNotification` helper's priority order (per-call deps first, then constructor-injected notifier) is preserved.

- **`private readonly notifier` fallback** — the renamed field is used identically to `defaultNotifier` today: consulted only when no per-call override is provided.

- **`OtcPurchaseServiceOptions` type** — the `notifier?` field remains, so direct instantiation in tests (`new OtcPurchaseService({ otcPurchaseRepo, wallexClient })`) continues to work unchanged.

- **No changes to `IOtcPurchaseNotifier` interface**, `TelegramOtcPurchaseNotifier`, `TOKENS`, or any module registration file.

- **No schema changes.**

- **No changes to test files** — the existing test suite constructs `OtcPurchaseService` via the options object without a notifier and passes per-call callbacks to `execute()`; this path is unaffected.

## Testing Decisions

- **What makes a good test:** Construct `OtcPurchaseService` and assert on the `OtcPurchase` entity returned by `execute()` and the DB state. To verify notification dispatch, either pass per-call `notifySuccess`/`notifyFailure` callbacks (existing pattern) or inject a mock `IOtcPurchaseNotifier` at construction and assert on its calls.

- **Modules to test:**
  - `OtcPurchaseService` — all 9 existing tests in `otc-purchase.service.test.ts` must pass unchanged. No new tests are required for this refactor specifically; the removal of `setNotifier` and `getNotifier` is verified by the absence of their call sites.
  - `bot.ts` integration — the existing bot-layer tests (`tests/bot/admin/approve.test.ts`, `tests/bot/admin/otc-retry.test.ts`) exercise the OTC flow end-to-end via `createBot` and must continue to pass unchanged.

- **Prior art:** `otc-purchase.service.test.ts` constructs the service directly with `new OtcPurchaseService({ otcPurchaseRepo, wallexClient })` and passes per-call callbacks to `execute()`. This is the pattern to preserve. `otc-purchase-notifier.test.ts` tests `TelegramOtcPurchaseNotifier` in isolation and is entirely unaffected.

## Out of Scope

- Changing `TelegramOtcPurchaseNotifier` or `IOtcPurchaseNotifier`.
- Changing the `OtcPurchaseServiceDependencies` per-call override interface on `execute()` / `retry()`.
- Changing `TOKENS` or any module registration file.
- Changing anything in the Order lifecycle notifier refactor (candidate 1, tracked in `.scratch/order-lifecycle-deepening/spec.md`).
- Changing the bot bootstrap deepening (candidate 2, tracked in `.scratch/bot-bootstrap-deepening/spec.md`).
- Any test file modifications.
- Any schema or database changes.

## Further Notes

- The `isRegistered` guard in `bot.ts` that wraps the `resolve(OtcPurchaseService)` + `setNotifier()` block (`if (appContainer.isRegistered(TOKENS.OtcPurchaseService) || appContainer.isRegistered(OtcPurchaseService))`) exists solely because `setNotifier()` requires a live service instance. Once that method is deleted, the entire guarded block goes with it — leaving the registration order as the sole correctness guarantee.
- The renamed field (`private readonly notifier`) should be consistently referred to as `notifier` throughout `sendNotification` to remove the `defaultNotifier` name, which implied the field was a fallback rather than the primary injection slot.
- This is the smallest of the three refactors: one field rename, two method deletions, and one block removed from `bot.ts`. The correct order to execute these three specs is: candidate 3 (this spec) first, then candidate 2 (bot bootstrap), then candidate 1 (Order lifecycle) — since candidate 1's notifier wiring will follow the same pattern established here.
