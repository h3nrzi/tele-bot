# 07: Order rejection service + `[✗ Reject]` inline keyboard flow

**Status:** done

**Blocked by:** 05 — Order claim service + `[▶ Start Processing]` handler

**What to build:** Any Admin can reject an Order from `PLACED` or `PROCESSING` via a pure inline keyboard flow. Rejection atomically writes a refund Ledger Transaction, restores the Buyer's Available Balance, and notifies the Buyer.

- Implement the order rejection service executing the refund transaction sequence:
  1. `SELECT … FROM orders WHERE id = ? FOR UPDATE`
  2. Assert `status IN ('PLACED', 'PROCESSING')`; reject if already terminal.
  3. `SELECT … FROM wallets WHERE user_id = ? FOR UPDATE`
  4. Insert one refund `ledger_transactions` row with `order_id` FK.
  5. Insert two `ledger_entries` rows: `CREDIT BUYER_WALLET` and `DEBIT SYSTEM_CASH`.
  6. `UPDATE ledger_transactions SET reversed_by_ledger_transaction_id = <refund_id> WHERE id = <original_debit_id>`.
  7. `UPDATE wallets SET available_balance = available_balance + ?`.
  8. `UPDATE orders SET status = 'REJECTED', rejection_category = ?, rejection_note = ?, rejected_at = now()`.
  9. Commit.
  10. Outside the transaction: notify Buyer (rejection category + note + refund amount + updated balance); edit all Admin notifications.
- Wire the `[✗ Reject]` callback to present the rejection inline keyboard flow:
  - Bot edits or replies with 5 preset category buttons: `Out of stock / temporarily unavailable`, `Cannot verify order legitimacy`, `Technical issue — unable to fulfil`, `Policy violation`, `Other (enter text)`.
  - Admin taps a category. Bot prompts: "Add a note? Type one now, or tap `[Skip]`." (If `OTHER`, a note is required — `[Skip]` is absent.)
  - Admin types a note or taps Skip.
  - Rejection service runs.
- Write unit tests: happy path from `PLACED` (refund ledger written, balance restored, status → `REJECTED`); happy path from `PROCESSING` (same); second rejection on already-terminal Order rejected; `reversed_by_ledger_transaction_id` on the original debit row correctly references the refund transaction.

## Acceptance criteria

- [x] `[✗ Reject]` is actionable from both `PLACED` and `PROCESSING` states.
- [x] The 5 preset category buttons are shown; `OTHER` makes the note mandatory.
- [x] On rejection: Order status is `REJECTED`, `rejection_category` and `rejection_note` are set, `rejected_at` is populated.
- [x] The Buyer's Available Balance is restored by exactly `usd_price_snapshot`.
- [x] The original debit `ledger_transactions` row has `reversed_by_ledger_transaction_id` set to the refund transaction's id.
- [x] The Buyer receives a Telegram notification with rejection reason, refund amount, and updated balance.
- [x] All Admin notifications are edited to reflect the terminal state.
- [x] Attempting to reject an already-terminal Order returns an appropriate error.
- [x] All rejection service unit tests pass.
- [x] TypeScript compiles without errors.

