# 05: Order claim service + `[▶ Start Processing]` handler

**Status:** ready-for-agent

**Blocked by:** 04 — Order placement service + Confirm handler

**What to build:** An Admin taps `[▶ Start Processing]` on an Order Admin Notification, instantly claiming the Order and updating every Admin's copy of the notification to reflect who is handling it.

- Implement the order claim service executing the claim transaction sequence:
  1. `SELECT … FROM orders WHERE id = ? FOR UPDATE`
  2. Assert `status = 'PLACED'`; return a "already claimed or closed" error if not.
  3. `UPDATE orders SET status = 'PROCESSING', claimed_by_admin_telegram_id = ?, claimed_at = now(), updated_at = now()`.
  4. Commit.
  5. Outside the transaction: read all `order_admin_notifications` for this Order and call `editMessageReplyMarkup` on each Admin's message, replacing buttons with `[🔒 Processing by @adminX]` (non-interactive) and `[📦 Fulfil Order]` + `[✗ Reject]` (stub callbacks — activated in tickets 06 and 07).
- Wire the `[▶ Start Processing]` callback handler to call the claim service.
- On success, the tapping Admin receives a brief confirmation reply.
- If a second Admin taps the button on a race, they receive a clear "already claimed" message; the notification has already been updated to show the first claimer.
- Write unit tests: happy path (status → `PROCESSING`, claimed fields set); second Admin claim on same Order returns "already claimed" error; claim on non-`PLACED` Order rejected.

## Acceptance criteria

- [ ] Tapping `[▶ Start Processing]` transitions the Order to `PROCESSING` and sets `claimed_by_admin_telegram_id` and `claimed_at`.
- [ ] All `order_admin_notifications` messages are edited to show the claimer's identity and the new button set.
- [ ] A second Admin tapping the button after the race receives a clear error and sees the updated notification.
- [ ] Tapping on an Order that is already terminal (FULFILLED, REJECTED, CANCELLED) returns an appropriate error.
- [ ] All claim service unit tests pass.
- [ ] TypeScript compiles without errors.
