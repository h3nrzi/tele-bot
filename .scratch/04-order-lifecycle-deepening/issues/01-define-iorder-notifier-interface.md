# 01: Define `IOrderNotifier` and register `TOKENS.OrderNotifier`

**What to build:** Introduce the `IOrderNotifier` interface — the seam that will eventually carry all post-commit notification dispatch out of `OrderService`. Declare five async methods, one per Order lifecycle event (`onOrderPlaced`, `onOrderClaimed`, `onOrderFulfilled`, `onOrderRejected`, `onOrderCancelled`), each accepting a typed context shape. Add `TOKENS.OrderNotifier` to the DI token registry. Nothing else changes — no implementations, no callers, no tests modified. After this ticket the seam exists but is not yet wired anywhere.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Create `src/modules/order/order.notifier.interface.ts` exporting `IOrderNotifier` with five async methods.
- [ ] Each method's context type is defined in the same file (they will move into `TelegramOrderNotifier` as private shapes in ticket 04).
- [ ] Add `OrderNotifier: Symbol('OrderNotifier')` to `TOKENS` in `src/core/di/tokens.ts`.
- [ ] No existing files other than `tokens.ts` are modified.
- [ ] TypeScript compiles cleanly with no new errors.
