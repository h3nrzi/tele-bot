# 09: `/orders` Admin queue command

**Status:** ready-for-agent

**Blocked by:** 04 — Order placement service + Confirm handler, 05 — Order claim service + `[▶ Start Processing]` handler, 07 — Order rejection service + `[✗ Reject]` inline keyboard flow

**What to build:** Admins can send `/orders` to see a live list of all active Orders (`PLACED` and `PROCESSING`) with the full set of action buttons, ensuring nothing falls through the cracks if an Admin missed the original notification.

- Implement the admin order queue service: list all Orders with `status IN ('PLACED', 'PROCESSING')`, including the Catalog Item name, Price Snapshot, Buyer username, and `claimed_by_admin_telegram_id` if set. Terminal Orders are excluded.
- Register the `/orders` Admin command. It calls the admin order queue service and renders each active Order as a message block with inline buttons:
  - `PLACED` Orders: `[▶ Start Processing]` and `[✗ Reject]` (reusing the callback handlers from tickets 05 and 07).
  - `PROCESSING` Orders claimed by this Admin: `[📦 Fulfil Order]` and `[✗ Reject]` (reusing ticket 06 and 07 handlers).
  - `PROCESSING` Orders claimed by a different Admin: `[🔒 Processing by @adminX]` (non-interactive) and `[✗ Reject]`.
- If the queue is empty, respond with a "no active orders" message.
- Write unit tests for the admin order queue service: returns only `PLACED` and `PROCESSING` Orders; terminal Orders (FULFILLED, REJECTED, CANCELLED) are excluded.

## Acceptance criteria

- [ ] `/orders` is restricted to Admin users; non-Admins receive an access-denied message.
- [ ] `PLACED` Orders show `[▶ Start Processing]` and `[✗ Reject]`; tapping either works identically to tapping from the original notification.
- [ ] `PROCESSING` Orders claimed by the current Admin show `[📦 Fulfil Order]` and `[✗ Reject]`.
- [ ] `PROCESSING` Orders claimed by another Admin show `[🔒 Processing by @adminX]` (non-interactive) and `[✗ Reject]`.
- [ ] Terminal Orders do not appear in the list.
- [ ] An empty queue shows a graceful "no active orders" message.
- [ ] All admin order queue service unit tests pass.
- [ ] TypeScript compiles without errors.
