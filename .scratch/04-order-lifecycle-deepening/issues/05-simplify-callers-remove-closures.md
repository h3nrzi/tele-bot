# 05: Simplify callers — remove callback closures from conversations and handlers

**What to build:** The payoff ticket. Every inline `dependencies` closure threaded into `orderService.*` calls is deleted across all five call sites. `fulfil.conversation.ts`, `order-reject.conversation.ts`, `claim.handler.ts`, `shop.handler.ts`, and `cancel.handler.ts` each become a single clean `orderService.*(input)` call with no second argument. Conversations no longer import admin keyboard builders for notification purposes. Bot-layer tests are updated to remove closure injection and any assertions that relied on closure execution, replaced with assertions on end-user-observable outcomes.

**Blocked by:** 04 — `TelegramOrderNotifier` must be wired before callers can safely drop their closures.

**Status:** ready-for-agent

- [ ] Delete all `dependencies` object literals passed to `orderService.*` across `fulfil.conversation.ts`, `order-reject.conversation.ts`, `claim.handler.ts`, `shop.handler.ts`, and `cancel.handler.ts`.
- [ ] Remove now-unused keyboard builder imports from `fulfil.conversation.ts` and `order-reject.conversation.ts` that were only imported for notification closures.
- [ ] Update bot-layer tests (`tests/bot/admin/orders.test.ts`, `tests/bot/admin/reject-order.test.ts`, and any others) to remove closure injection and related assertions.
- [ ] Verify no handler or conversation file retains any import of a `*Dependencies` or `*NotificationContext` type from `order.dto.ts`.
- [ ] `tsc --noEmit` reports zero errors; all updated tests pass.
