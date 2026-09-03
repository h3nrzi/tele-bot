# 04: Order placement service + Confirm handler

**Status:** done

**Blocked by:** 01 — Schema migration & Drizzle types, 03 — Buyer `/shop` + order confirmation prompt

**What to build:** Tapping `[✓ Confirm]` on the shop prompt places an Order atomically: the Buyer's Wallet is debited, a double-entry Ledger Transaction is written, the Order is created at `PLACED` with the Price Snapshot locked in, and Order Admin Notifications are dispatched to every Admin.

- Implement the order placement service executing the full placement transaction sequence:
  1. `SELECT … FROM wallets WHERE user_id = ? FOR UPDATE`
  2. Assert `available_balance >= usd_price_snapshot`; abort with insufficient-balance error if not.
  3. Insert the `orders` row at `PLACED` with `usd_price_snapshot` copied from `catalog_items.usd_price` at call time.
  4. Insert one `ledger_transactions` row with `order_id` FK.
  5. Insert two `ledger_entries` rows: `DEBIT BUYER_WALLET` and `CREDIT SYSTEM_CASH` for `usd_price_snapshot`.
  6. `UPDATE wallets SET available_balance = available_balance - ?`.
  7. Commit.
  8. Outside the transaction: insert `order_admin_notifications` rows and dispatch push notifications to each Admin with full-context message (SKU name, description, price, Buyer username, post-debit Available Balance) and `[▶ Start Processing]` and `[✗ Reject]` inline buttons (callbacks wired as stubs — activated in tickets 05 and 07).
- Wire the `[✓ Confirm]` callback in the `/shop` handler to call the placement service.
- On success, reply to the Buyer with an order-placed confirmation message.
- On race-condition insufficient-balance (balance was sufficient at display time but not at lock time), reply with a clear error.
- Write unit tests: happy path (wallet debited, ledger rows written, order at `PLACED`, price snapshot matches); insufficient balance at lock time rejected; concurrent placements on the same wallet do not produce a negative Available Balance.

## Acceptance criteria

- [x] Tapping `[✓ Confirm]` creates one `orders` row at `PLACED` with `usd_price_snapshot` matching the Catalog Item price at the moment of placement.
- [x] One `ledger_transactions` row and two `ledger_entries` rows (DEBIT BUYER_WALLET + CREDIT SYSTEM_CASH) are written inside the same transaction.
- [x] The Buyer's Available Balance is reduced by exactly `usd_price_snapshot`.
- [x] Admin notification messages are sent with the correct context and buttons.
- [x] A second concurrent placement from the same Buyer does not produce a negative Available Balance.
- [x] Insufficient-balance at transaction lock time surfaces a clear error to the Buyer.
- [x] All placement service unit tests pass.
- [x] TypeScript compiles without errors.
