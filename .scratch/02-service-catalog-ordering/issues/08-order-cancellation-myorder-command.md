# 08: Order cancellation service + `/myorder` Buyer command

**Status:** done

**Blocked by:** 04 — Order placement service + Confirm handler, 07 — Order rejection service + `[✗ Reject]` inline keyboard flow

**What to build:** Buyers can view their most recent Order via `/myorder` and, if it is still `PLACED`, cancel it for an immediate refund. The cancellation uses the same refund pattern established in ticket 07.

- Implement the order cancellation service:
  1. Assert caller's `user_id` matches the Order's `user_id`; reject non-owners.
  2. Assert `status = 'PLACED'`; reject if the Order has been claimed or is terminal.
  3. `SELECT … FROM orders WHERE id = ? FOR UPDATE` and `SELECT … FROM wallets WHERE user_id = ? FOR UPDATE`.
  4. Insert one refund `ledger_transactions` row with `order_id` FK.
  5. Insert two `ledger_entries` rows: `CREDIT BUYER_WALLET` and `DEBIT SYSTEM_CASH`.
  6. `UPDATE ledger_transactions SET reversed_by_ledger_transaction_id = <refund_id> WHERE id = <original_debit_id>`.
  7. `UPDATE wallets SET available_balance = available_balance + ?`.
  8. `UPDATE orders SET status = 'CANCELLED', cancelled_at = now()`.
  9. Commit.
  10. Outside the transaction: notify Buyer (refund amount + updated balance); edit all Admin notifications to remove action buttons.
- Implement the buyer order status service: fetch the most recent Order for the requesting Buyer regardless of status.
- Register the `/myorder` Buyer command. It calls the buyer order status service and renders: Catalog Item name, Price Snapshot, current Order status. When `status = 'PLACED'`, include a `[✗ Cancel]` inline button. When `status = 'PROCESSING'`, include a message explaining that cancellation is no longer possible.
- Wire the `[✗ Cancel]` callback to call the cancellation service.
- Write unit tests: happy path from `PLACED` (refund written, balance restored, status → `CANCELLED`); cancel from `PROCESSING` rejected; non-owner Buyer cancel rejected; buyer order status service returns most recent Order regardless of status.

## Acceptance criteria

- [x] `/myorder` shows the most recent Order's Catalog Item name, Price Snapshot, and current status.
- [x] `[✗ Cancel]` is present when `status = 'PLACED'`; a clear explanation is shown when `status = 'PROCESSING'`.
- [x] On cancellation: Order status is `CANCELLED`, `cancelled_at` is set, Buyer's Available Balance is restored.
- [x] The original debit `ledger_transactions` row has `reversed_by_ledger_transaction_id` set to the refund transaction's id.
- [x] All Admin notifications are edited to remove action buttons.
- [x] The Buyer receives a Telegram notification with refund amount and updated balance.
- [x] A non-owner Buyer attempting cancellation is rejected.
- [x] Cancellation from `PROCESSING` (or any terminal state) is rejected.
- [x] All cancellation service unit tests pass.
- [x] TypeScript compiles without errors.
