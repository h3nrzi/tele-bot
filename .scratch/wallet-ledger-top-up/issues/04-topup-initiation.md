# 04: Top-Up initiation (/topup)

**What to build:** A Buyer sends `/topup`, enters a USD amount, and the bot replies with the exact IRR amount to transfer and the full Bank Account card details (card number, holder name, bank name, any special instructions). The Exchange Rate is locked onto the request at this moment and will not change. The Buyer now has a Top-Up Request in `INITIATED` state. If the Buyer tries to open a second Top-Up Request while one is already active, the bot refuses. If no Exchange Rate has been configured, the Buyer sees a friendly "temporarily unavailable" message and all Admins receive an urgent alert.

**Blocked by:** 02 — Exchange rate management, 03 — Bank account management

**Status:** ready-for-agent

- [x] Drizzle migration creates the `top_up_requests` table with columns: `id` UUID PK, `user_id` UUID FK → `users` NOT NULL, `exchange_rate_id` UUID FK → `exchange_rates` NOT NULL, `usd_amount` NUMERIC(18,2) NOT NULL, `irr_amount` BIGINT NOT NULL, `status` ENUM(`INITIATED`,`PENDING`,`APPROVED`,`REJECTED`,`EXPIRED`,`CANCELLED`) NOT NULL, `receipt_file_id` VARCHAR nullable, `receipt_caption` TEXT nullable, `rejection_reason` TEXT nullable, `expires_at` TIMESTAMPTZ NOT NULL, `processed_by_admin_telegram_id` BIGINT nullable, `processed_at` TIMESTAMPTZ nullable, `created_at` TIMESTAMPTZ NOT NULL, `updated_at` TIMESTAMPTZ NOT NULL.
- [ ] ⚠️ [DIFFICULT] Migration also creates a partial unique index: `top_up_requests(user_id) WHERE status IN ('INITIATED', 'PENDING')`.
- [ ] Amount validation module reads `TOPUP_MIN_USD` and `TOPUP_MAX_USD` from environment variables and uses `decimal.js` to compare. Both variables are required; the bot fails to start if either is absent.
- [ ] `irr_amount` is computed as `round(usd_amount × irr_per_usd)` using `decimal.js`; stored as a `BIGINT`.
- [ ] Top-Up initiation service: validates amount bounds, fetches the current Exchange Rate via `getCurrentRate()`, computes `irr_amount`, sets `expires_at = now() + TOPUP_INITIATED_EXPIRY_MINUTES`, and inserts the `top_up_requests` row. Returns the created request.
- [ ] ⚠️ [DIFFICULT] If `getCurrentRate()` returns `null`: the service returns a no-rate error; the handler sends the Buyer a friendly "temporarily unavailable" message and pushes an urgent alert to every Telegram chat ID listed in `ADMIN_IDS`.
- [ ] ⚠️ [DIFFICULT] If the Buyer already has a `top_up_requests` row with status `INITIATED` or `PENDING`: the partial unique index causes an insert conflict; the service surfaces a clear "you already have an active request" error to the Buyer.
- [ ] ⚠️ [DIFFICULT] `/topup` command uses the grammY `conversations` plugin: prompts for a USD amount, validates it, and replies with the locked IRR amount and card details. The conversation can be cancelled at any step.
- [ ] All USD values in bot messages are formatted with `decimal.js` to exactly 2 decimal places. IRR values are formatted as integers with thousands separators.
- [ ] Top-Up initiation service tests cover: happy path (request row created, `exchange_rate_id` FK matches current rate, `irr_amount` correct, `expires_at` set), amount below minimum rejected, amount above maximum rejected, no-rate-configured error path, second initiation while `INITIATED` request active rejected by partial unique index, second initiation while `PENDING` request active rejected.
