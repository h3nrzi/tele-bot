# 02: Schema Migration — exchange_rate_config, top_up_requests columns, wallex_otc_purchases

**What to build:** A single Drizzle migration that introduces the three schema changes needed by the Wallex OTC feature, with corresponding Drizzle schema definitions and domain entities. After the migration, the app boots and behaves identically to before (backward-compatible): Manual mode, 0% Spread, all existing Top-Up Requests backfilled. The three changes are:

1. **`exchange_rate_config`** — Mutable singleton table with `mode` (`MANUAL` | `AUTO_SYNC`), `spread_percent` (numeric(5,2), 0–10%), `sync_interval_minutes` (integer, default 60), `updated_by_admin_telegram_id`, and timestamps. Singleton enforced via upsert. Seeded with safe defaults (`MANUAL`, 0%, 60 min) in the migration.

2. **`top_up_requests` columns** — Add `locked_irr_per_usd` (bigint), `rate_source` (varchar: `'MANUAL'`, `'OTC_QUOTE'`, `'BASELINE_FALLBACK'`). Make `exchange_rate_id` nullable. Backfill existing rows: `locked_irr_per_usd` from joined `exchange_rates.irr_per_usd`, `rate_source = 'MANUAL'`. Then apply NOT NULL constraints on the new columns.

3. **`wallex_otc_purchases`** — Audit table with `top_up_request_id` (FK, not unique), `usdt_quantity`, `status` enum (`PENDING`, `COMPLETED`, `FAILED`), Wallex execution details (`wallex_client_order_id`, `wallex_executed_price`, `wallex_executed_qty`, `wallex_executed_sum`, `wallex_fee`), `error_message`, and timestamps. Partial unique index on `(top_up_request_id) WHERE status IN ('PENDING', 'COMPLETED')` prevents duplicate active purchases.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Drizzle migration creates `exchange_rate_config` table with all columns and seeds defaults
- [ ] Drizzle migration adds `locked_irr_per_usd` and `rate_source` to `top_up_requests`, makes `exchange_rate_id` nullable
- [ ] Backfill populates `locked_irr_per_usd` from joined `exchange_rates` and sets `rate_source = 'MANUAL'` for all existing rows
- [ ] NOT NULL constraints applied to new columns after backfill
- [ ] Drizzle migration creates `wallex_otc_purchases` table with partial unique index
- [ ] Drizzle schema files and entity types added for all new/modified tables
- [ ] Schema barrel (`core/database/schema.ts`) and DI tokens updated
- [ ] Existing tests still pass — app boots identically in Manual mode
