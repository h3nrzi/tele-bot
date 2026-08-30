# 06: Order fulfilment service + `[📦 Fulfil Order]` conversation

**Status:** ready-for-agent

**Blocked by:** 05 — Order claim service + `[▶ Start Processing]` handler

**What to build:** The claiming Admin taps `[📦 Fulfil Order]`, enters a 3-step grammY conversation to type, preview, and confirm Delivery Content, and on confirmation the Order is fulfilled: the content is stored, forwarded to the Buyer, and all Admin notifications reflect completion.

- Implement the order fulfilment service:
  1. Assert caller's Telegram ID = `claimed_by_admin_telegram_id`; reject non-claimers.
  2. Assert `status = 'PROCESSING'`; reject if not.
  3. Write `delivery_content`, set `fulfilled_at`, transition to `FULFILLED`, commit.
  4. Outside the transaction: forward Delivery Content to the Buyer; edit all Admin notifications to reflect `FULFILLED` state.
- Wire the `[📦 Fulfil Order]` callback to reset any dangling grammY conversation state for this Admin, then start the 3-step conversation:
  - **Step 1 — Input**: bot prompts the Admin to type the Delivery Content.
  - **Step 2 — Preview & Confirm**: bot echoes the content and presents `[✓ Send]` and `[✗ Re-enter]`. Tapping Re-enter loops back to Step 1.
  - **Step 3 — Commit**: on Confirm, the fulfilment service runs.
- Tapping `[📦 Fulfil Order]` again at any point resets the conversation, discarding previous incomplete input.
- Non-claiming Admins who attempt the flow receive an access-denied message immediately.
- Write unit tests: happy path (delivery_content written, status → `FULFILLED`); non-claimer attempt rejected; fulfilment on non-`PROCESSING` Order rejected.

## Acceptance criteria

- [ ] Tapping `[📦 Fulfil Order]` always starts a fresh conversation, discarding any prior incomplete state.
- [ ] Admin who did not claim the Order is rejected before the conversation begins.
- [ ] On Confirm: `delivery_content` is written, Order status is `FULFILLED`, `fulfilled_at` is set.
- [ ] The Buyer receives the Delivery Content as a Telegram message.
- [ ] All Admin notifications are edited to reflect the `FULFILLED` state.
- [ ] Re-enter loops back to Step 1 without submitting.
- [ ] All fulfilment service unit tests pass.
- [ ] TypeScript compiles without errors.
