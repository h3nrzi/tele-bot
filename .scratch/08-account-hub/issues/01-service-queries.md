# 01: Service queries — three new read-only methods

**What to build:** Add three new query methods so the rest of the Account Hub has data to display. From the Buyer's perspective, this ticket makes no visible difference yet — it is pure service plumbing that gates everything else.

- `getRecentOrdersForBuyer(telegramChatId, limit)` on `OrderService` — returns the last N Orders for the Buyer joined with their Catalog Item name.
- `getOrderCountBreakdown(telegramChatId)` on `OrderService` — returns counts grouped into three display buckets: ✅ Fulfilled (`FULFILLED`), ⏳ In Progress (`PLACED` + `PROCESSING`), ❌ Cancelled (`CANCELLED` + `REJECTED`).
- `getRecentWalletTransactions(walletId, limit)` on `WalletService` or `LedgerService` — returns the last N `BUYER_WALLET` Ledger Entries for a given wallet, joined with their parent Ledger Transaction's `narrative`.

No schema changes are needed. All required data already exists.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] `getRecentOrdersForBuyer` added to `OrderService`; returns orders in descending date order, each carrying the Catalog Item name.
- [x] `getOrderCountBreakdown` added to `OrderService`; returns `{ fulfilled: number; inProgress: number; cancelled: number }`.
- [x] `getRecentWalletTransactions` added to `WalletService` (or `LedgerService`); returns entries in descending date order, each carrying the parent transaction's `narrative`.
- [x] All three methods are covered by integration tests (mirroring the pattern in `tests/modules/order/order-queue.service.test.ts`); CI is green.

