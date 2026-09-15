# 02: Implement `InMemoryOrderNotifier`

**What to build:** A test-helper adapter that implements `IOrderNotifier` by recording every call in typed arrays — no Telegram API involved. Tests in subsequent tickets will inject it into `OrderService` at construction time and inspect `notifier.recordedPlaced`, `notifier.recordedClaimed`, etc. to verify notification context without side effects. Ship it with its own isolated unit tests that assert it records calls correctly.

**Blocked by:** 01 — `IOrderNotifier` interface must exist first.

**Status:** completed

- [x] Create the `InMemoryOrderNotifier` class, placed alongside other test helpers (e.g. `tests/helpers/in-memory-order-notifier.ts`), implementing `IOrderNotifier`.
- [x] Each method pushes its argument onto a typed array (e.g. `recordedPlaced: OnOrderPlacedContext[]`).
- [x] Expose a `reset()` method to clear all recorded arrays between test cases.
- [x] Write unit tests confirming each method records its argument and that `reset()` clears the arrays.
- [x] No production source files are modified.
- [x] TypeScript compiles cleanly.
