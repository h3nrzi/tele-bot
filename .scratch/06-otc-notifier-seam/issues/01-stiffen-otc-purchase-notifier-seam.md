# 01: Stiffen the OTC Purchase Notifier Seam

**What to build:** Remove the dual-injection ambiguity in `OtcPurchaseService`. After this ticket, the service is fully initialised at the moment it is resolved from the DI container — no post-construction mutation, no public accessors for implementation state.

Concretely:

- `OtcPurchaseService` drops `setNotifier()` and `getNotifier()`. The mutable `defaultNotifier` field is renamed to `private readonly notifier`, set once via constructor injection (DI path) or the `OtcPurchaseServiceOptions.notifier` field (direct-instantiation / test path). The `sendNotification` helper is updated to reference `this.notifier` throughout.
- In `bot.ts`, `TelegramOtcPurchaseNotifier` is instantiated and registered against `TOKENS.OtcPurchaseNotifier` immediately after the `Bot` instance is created — before any service resolution. The guarded `isRegistered` block that called `otcService.setNotifier()` is deleted entirely.
- The `OtcPurchaseServiceDependencies` per-call `notifySuccess` / `notifyFailure` / `notifier` overrides on `execute()` and `retry()` are untouched; their priority over the constructor-injected notifier is preserved.
- All tests in `otc-purchase.service.test.ts`, `approve.test.ts`, and `otc-retry.test.ts` pass without modification.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] `private readonly notifier?: IOtcPurchaseNotifier` replaces `private defaultNotifier?: IOtcPurchaseNotifier` in `OtcPurchaseService`
- [x] `setNotifier()` and `getNotifier()` methods are deleted from `OtcPurchaseService`
- [x] All references to `defaultNotifier` inside `sendNotification` (and anywhere else in the service) are renamed to `notifier`
- [x] `OtcPurchaseServiceOptions.notifier?` field is retained so direct-instantiation tests keep working
- [x] In `bot.ts`: `TelegramOtcPurchaseNotifier` construction + `appContainer.register(TOKENS.OtcPurchaseNotifier, …)` appears before any `container.resolve` call that depends on `OtcPurchaseService`
- [x] The `isRegistered` guard block (and the `resolve(OtcPurchaseService)` + `setNotifier()` call inside it) is deleted from `bot.ts`
- [x] All existing tests pass (`pnpm test`) with no test file modifications
