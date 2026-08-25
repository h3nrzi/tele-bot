# 02: Exchange rate management (/setrate, /rate)

**What to build:** An Admin sends `/setrate 620000` and the bot confirms the new USD→IRR Exchange Rate is active. Any Admin can then send `/rate` to see the current rate. Non-Admin Telegram users attempting either command receive no response. Every rate change is permanently appended to the database; no rate is ever overwritten.

**Blocked by:** 01 — Project scaffold + Buyer registration + /balance

**Status:** ready-for-agent

- [x] Drizzle migration creates the `exchange_rates` table (`id` UUID PK, `irr_per_usd` BIGINT NOT NULL, `created_by_admin_telegram_id` BIGINT NOT NULL, `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()). No UPDATE or DELETE is ever issued against this table.
- [x] Admin middleware reads the `ADMIN_IDS` environment variable (comma-separated Telegram chat IDs) and silently drops any update from a non-Admin sender before it reaches an Admin handler. No database read is performed for this check.
- [x] Exchange rate service: `setRate(adminTelegramId, irrPerUsd)` appends a new row and returns it. The function never modifies existing rows.
- [ ] Exchange rate service: `getCurrentRate()` returns the most recently created `exchange_rates` row, or `null` if no row exists.
- [ ] `/setrate <irr_amount>` Admin command: validates that `<irr_amount>` is a positive integer, calls `setRate`, and confirms the new active rate to the Admin.
- [ ] `/setrate` with a missing, zero, or non-numeric argument replies with a clear usage error to the Admin.
- [ ] `/rate` Admin command: if a rate exists, shows the current `irr_per_usd` value and when it was set; if no rate exists, tells the Admin that no rate is configured.
- [ ] Both commands are silently ignored when sent by a non-Admin.
- [ ] Exchange rate service tests cover: appending a first rate, appending a subsequent rate (both rows persist), `getCurrentRate` returns the newest row, `getCurrentRate` returns `null` on an empty table.
