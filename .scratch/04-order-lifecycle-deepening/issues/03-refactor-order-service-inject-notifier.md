# 03: Refactor `OrderService` to inject `IOrderNotifier` and drop all `*Dependencies` params

**What to build:** The heaviest mechanical change. `OrderService` gains an optional `IOrderNotifier` constructor injection (`@inject(TOKENS.OrderNotifier)`). All five public methods (`placeOrder`, `claimOrder`, `fulfilOrder`, `rejectOrder`, `cancelOrder`) lose their `dependencies?` parameter entirely. Post-commit notification dispatch now calls `this.notifier.onOrder*()` internally, fire-and-forget with the same try/catch resilience as before. The five `*Dependencies` callback interfaces and all `*NotificationContext` types are removed from `order.dto.ts`. All five existing service test files are updated: callback-closure mocking is replaced with `InMemoryOrderNotifier` injection at construction time and assertions on the notifier's recorded-call arrays.

**Blocked by:** 01 (`IOrderNotifier` interface), 02 (`InMemoryOrderNotifier` test double).

**Status:** ready-for-agent

- [ ] Add optional `@inject(TOKENS.OrderNotifier) private readonly notifier?: IOrderNotifier` to `OrderService` constructor.
- [ ] Remove the `dependencies?` second parameter from `placeOrder`, `claimOrder`, `fulfilOrder`, `rejectOrder`, and `cancelOrder`.
- [ ] Replace each `if (dependencies?.notify*)` block with `if (this.notifier)` calling the appropriate `IOrderNotifier` method.
- [ ] Remove `PlaceOrderDependencies`, `ClaimOrderDependencies`, `FulfilOrderDependencies`, `RejectOrderDependencies`, `CancelOrderDependencies` from `order.dto.ts`.
- [ ] Remove the `*NotificationContext` types from `order.dto.ts` (private shapes move to `TelegramOrderNotifier` in ticket 04).
- [ ] Update all five service tests — inject `InMemoryOrderNotifier` at construction and assert on recorded calls instead of callback mocks.
- [ ] TypeScript compiles cleanly; all updated tests pass.
