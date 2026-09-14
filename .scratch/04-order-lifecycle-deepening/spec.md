Status: ready-for-agent

# Spec: Collapse the Order Lifecycle Module

## Problem Statement

Every Order lifecycle operation (`placeOrder`, `claimOrder`, `fulfilOrder`, `rejectOrder`, `cancelOrder`) currently accepts 2–3 optional callback function dependencies that carry the full Telegram API logic across the seam from the presentation layer into the domain service. The Telegram API leaks into three conversation files and two handler files — every caller must wire message-sending and keyboard-editing code inline as closures. Adding or changing notification behavior requires editing each call site separately. The DTO file (`order.dto.ts`) exists almost entirely to shuttle these callback context shapes, and eleven context types are defined purely to pass data between the service and its callers' closures.

## Solution

Introduce a `IOrderNotifier` interface at the `OrderService` seam. Inject a `TelegramOrderNotifier` adapter that implements it at construction time via the DI container. Move all post-commit notification dispatch (Buyer push messages, Admin Order Notification keyboard edits) inside `OrderService`. Callers (`fulfil.conversation.ts`, `order-reject.conversation.ts`, `claim.handler.ts`, `shop.handler.ts`, `cancel.handler.ts`) call each operation with a plain input DTO — no callbacks, no Telegram knowledge required. Tests inject an in-memory notifier adapter.

## User Stories

1. As a developer adding a new Order operation, I want to call `orderService.fulfilOrder(input)` without supplying callback functions, so that I do not need to understand Telegram message-editing mechanics to use the service.
2. As a developer, I want all Buyer push notification logic for Order state transitions to live in one module, so that I only have to edit one file when notification copy or formatting changes.
3. As a developer, I want all Admin Order Notification keyboard-edit logic for Order state transitions to live in one module, so that I only have to edit one file when Order keyboard layouts change.
4. As a developer writing unit tests for `OrderService`, I want to inject an in-memory `IOrderNotifier` adapter, so that my tests do not require a live Telegram API or complex closure mocks.
5. As a developer writing integration tests for Order operations, I want to assert on notifications by inspecting what the notifier received, so that I can verify notification context without wiring Telegram API calls.
6. As a developer, I want the existing test pattern (`orderService.fulfilOrder({...})` with no callbacks) to continue working after this refactor, so that existing tests need minimal or no changes.
7. As a developer reviewing a conversation file, I want to see a single `orderService.fulfilOrder(input)` call with no inline closures, so that the conversation flow is easy to read and audit.
8. As a developer, I want the `PlaceOrderDependencies`, `ClaimOrderDependencies`, `FulfilOrderDependencies`, `RejectOrderDependencies`, and `CancelOrderDependencies` callback types removed from the public interface, so that the DTO file only contains input and result shapes.
9. As a developer, I want `OrderService` to be registerable in the DI container with its notifier injected at construction — not wired by calling a setter after resolution — so that the service's dependencies are fully declared at initialization time.
10. As a developer, I want the `TelegramOrderNotifier` to be testable in isolation via its own `IOrderNotifier` interface, so that Telegram API formatting can be verified without running full order lifecycle tests.
11. As a developer, I want the in-memory `IOrderNotifier` adapter (used in tests) to record each call it receives, so that test assertions can inspect what notification context was dispatched without side effects.
12. As a developer, I want the refactored `OrderService` to remain resilient: if the notifier throws, the order operation should succeed and the error should be logged, matching the existing fire-and-forget contract.
13. As a developer, I want a single `IOrderNotifier` interface to cover all five lifecycle events (placed, claimed, fulfilled, rejected, cancelled), so that the seam is defined in one place and swappable as a unit.

## Implementation Decisions

- **New interface: `IOrderNotifier`** — defines five async methods, one per Order lifecycle event:
  - `onOrderPlaced(context)` — sends Admin Order Notification push messages and persists `order_admin_notifications` rows
  - `onOrderClaimed(context)` — edits Admin Order Notification keyboards to the PROCESSING layout
  - `onOrderFulfilled(context)` — sends Delivery Content to Buyer; edits Admin Order Notification keyboards to the FULFILLED layout
  - `onOrderRejected(context)` — sends rejection/refund message to Buyer; edits Admin Order Notification keyboards to the REJECTED layout
  - `onOrderCancelled(context)` — sends cancellation/refund message to Buyer; edits Admin Order Notification keyboards to the CANCELLED layout

- **New adapter: `TelegramOrderNotifier`** — implements `IOrderNotifier` using `grammy`'s `Bot.api`. Takes `Bot<BotContext>` (or `Api`) and the Admin IDs set at construction. Internally re-uses existing keyboard builders from `order.keyboards.ts` and `buyer/order.keyboards.ts`.

- **New adapter: `InMemoryOrderNotifier`** (test helper) — implements `IOrderNotifier`, records every call in typed arrays so tests can assert on dispatched context without side effects.

- **`OrderService` constructor change** — add `IOrderNotifier` as an injected dependency (optional; if absent, the service skips notification dispatch, preserving the current test-friendly behavior when no notifier is registered). Remove all optional `dependencies?` parameters from every public method signature.

- **DTO cleanup** — remove the five `*Dependencies` callback interfaces (`PlaceOrderDependencies`, `ClaimOrderDependencies`, `FulfilOrderDependencies`, `RejectOrderDependencies`, `CancelOrderDependencies`) and the associated `*NotificationContext` shapes that existed solely to feed those callbacks. Input and result DTOs (`PlaceOrderInput`, `PlaceOrderResult`, etc.) remain unchanged.

- **`bot.ts` wiring** — `TelegramOrderNotifier` is constructed after the bot is created (so `bot.api` is available) and registered in the DI container before `OrderService` is resolved, using the same registration pattern as `TelegramOtcPurchaseNotifier`.

- **Conversation and handler simplification** — all closures passed as `dependencies` to `orderService.*` methods are deleted. The conversation files (`fulfil.conversation.ts`, `order-reject.conversation.ts`) and handlers (`claim.handler.ts`, `cancel.handler.ts`, `shop.handler.ts`) call the service with only the input DTO. The conversations no longer need to import keyboard builders for notification purposes.

- **Admin Order Notification persistence** — `onOrderPlaced` is responsible for both sending the Telegram push and persisting the `order_admin_notifications` rows (currently handled by `orderRepo.createAdminNotifications` called inside the service after the `notifyAdmins` callback). This logic moves into `TelegramOrderNotifier.onOrderPlaced`. The `OrderService.placeOrder` result continues to return `adminNotifications` by fetching them from the repo after the notifier runs.

- **No schema changes** — all database tables remain unchanged.

- **No new seam** — the test seam remains the `OrderService` public interface, consistent with all existing order service tests.

## Testing Decisions

- **What makes a good test:** Call `orderService.*` methods, assert on the returned entity shapes and DB state. To assert on notifications, inspect the recorded calls on an `InMemoryOrderNotifier` injected at construction. Do not test Telegram API interactions directly in service tests; do not test internal private methods.

- **Modules to test:**
  - `OrderService` — existing tests (`order-placement.service.test.ts`, `order-claim.service.test.ts`, `order-fulfilment.service.test.ts`, `order-rejection.service.test.ts`, `order-cancellation.service.test.ts`) are updated to remove callback assertions. New assertions use the `InMemoryOrderNotifier` to verify notification context.
  - `TelegramOrderNotifier` — isolated unit tests verifying message text and keyboard output per event, using a mock `Api`.
  - Existing bot handler/conversation tests (`fulfil.test.ts`, `reject-order.test.ts`, `claim.test.ts`, `cancel.test.ts`, `shop.test.ts`) are updated to remove closure injection and any assertions that relied on callback execution.

- **Prior art:** The pattern established by `OtcPurchaseService` / `TelegramOtcPurchaseNotifier` / `IOtcPurchaseNotifier` (in `src/modules/otc-purchase/`) is the direct precedent for this refactor and should be followed closely. The existing order service tests in `tests/modules/order/` are the structural template for updated tests.

## Out of Scope

- Changing the content or wording of any Telegram notification messages — only the _location_ of that logic changes.
- Changing the Admin Order Notification keyboard layouts.
- Changing the Order state machine, status transitions, or database schema.
- Refactoring `TopUpService` or any other service.
- The OTC Purchase notifier seam fix (candidate 3) — that is a separate effort.
- The bot bootstrap deepening (candidate 2) — that is a separate effort.
- Internationalization or copy changes.

## Further Notes

- The `TopUpService` already follows the callback-dependencies pattern for `approveTopUp` and `rejectTopUp`. This spec does not touch those methods — they are out of scope and can be addressed in a later refactor if desired.
- The existing `editAdminOrderNotificationMessages` helper in `order.keyboards.ts` can be reused directly inside `TelegramOrderNotifier`; it does not need to be deleted.
- All five `*NotificationContext` types that are removed from the public DTO file should be defined as private types inside `TelegramOrderNotifier`, as they are only needed by its implementation.
- The `IOrderNotifier` token should follow the existing `TOKENS` pattern in `src/core/di/tokens.ts`.
