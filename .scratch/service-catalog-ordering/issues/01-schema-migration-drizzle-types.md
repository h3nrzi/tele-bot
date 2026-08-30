# 01: Schema migration & Drizzle types

**Status:** ready-for-agent

**Blocked by:** None (can start immediately)

**What to build:** Add the four database changes that RFP #2 requires — two new tables, one join table, and two amended columns — so that all later tickets have a stable data layer to build on. No application logic changes; this ticket is pure schema scaffolding.

- Add the `catalog_items` table (id, name, description, usd_price, is_active, created_at, updated_at).
- Add the `orders` table with all status-lifecycle columns (id, user_id, catalog_item_id, usd_price_snapshot, status enum, delivery_content, rejection_category, rejection_note, claimed_by_admin_telegram_id, claimed_at, fulfilled_at, rejected_at, cancelled_at, created_at, updated_at).
- Add the `order_admin_notifications` join table (id, order_id, admin_telegram_id, chat_id, message_id, created_at).
- Add two nullable FK columns to `ledger_transactions`: `order_id` (FK → orders) and `reversed_by_ledger_transaction_id` (self-referential FK → ledger_transactions), plus the XOR CHECK constraint ensuring exactly one of `top_up_request_id` or `order_id` is non-null per row.
- Write the corresponding Drizzle schema files and export them from `src/core/database/schema.ts`.
- Generate and commit a Drizzle migration file.

## Acceptance criteria

- [x] `catalog_items`, `orders`, and `order_admin_notifications` tables exist in the database after running migrations.
- [x] `ledger_transactions` has `order_id` and `reversed_by_ledger_transaction_id` columns; the XOR CHECK constraint is present.
- [x] Drizzle schema files compile without TypeScript errors.
- [x] `schema.ts` re-exports the new schema files.
- [x] `drizzle-kit generate` produces no additional migrations (schema is in sync).
- [x] Existing RFP #1 migrations and tests continue to pass.

