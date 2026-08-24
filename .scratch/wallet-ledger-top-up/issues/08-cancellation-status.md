# 08: Buyer cancellation + /status

**What to build:** A Buyer who has started a Top-Up Request but has not yet uploaded a receipt can send `/cancel` to abandon it. The bot confirms the cancellation and the request is marked `CANCELLED`. Once a receipt has been submitted (request is `PENDING`), the bot explains that cancellation is no longer possible and the Admin must act. A Buyer can send `/status` at any time to see the current state of their most recent Top-Up Request — including status, USD amount, and (if rejected) the rejection reason.

**Blocked by:** 04 — Top-Up initiation (/topup)

**Status:** ready-for-agent

- [ ] Cancellation service accepts `(userId)`, fetches the most recent non-terminal Top-Up Request for the Buyer, and branches: if status is `INITIATED` → updates status to `CANCELLED` and returns success; if status is `PENDING` → returns a "cannot cancel after receipt submitted" error without modifying the row; if no active request exists → returns a "no active request" error.
- [ ] The status update to `CANCELLED` is a single `UPDATE` statement. No Ledger rows are written. The Buyer's `available_balance` is unchanged.
- [ ] `/cancel` command handler: calls the cancellation service and replies with a clear outcome message for each case (cancelled, cannot cancel, no active request).
- [ ] Buyer status service accepts `(userId)` and returns the most recent `top_up_requests` row for that Buyer regardless of status, or `null` if none exists.
- [ ] `/status` command handler: if no request exists, tells the Buyer they have no top-up history. Otherwise formats a status message that includes: request status, USD amount, IRR amount, date initiated, and — if `REJECTED` — the full `rejection_reason`.
- [ ] `/status` and `/cancel` are silently ignored for unregistered senders (no `users` row).
- [ ] Cancellation service tests cover: `INITIATED` request cancelled successfully (status → `CANCELLED`, row persisted); `PENDING` request returns "cannot cancel" error (row unchanged); no active request returns appropriate error; cancellation does not affect `available_balance`.
- [ ] Buyer status service tests cover: returns most recent request for a Buyer with one request; returns most recent request for a Buyer with multiple historical requests; returns `null` for a Buyer with no requests.
