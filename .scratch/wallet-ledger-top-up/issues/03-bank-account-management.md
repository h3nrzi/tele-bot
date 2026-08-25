# 03: Bank account management (/setcard)

**What to build:** An Admin sends `/setcard` and the bot walks them through a short guided flow — collecting card number, card holder name, bank name, and optional transfer instructions — then confirms the new Bank Account is active. From this moment, any Buyer who initiates a Top-Up sees these card details. Only one Bank Account is active at any time; setting a new one automatically deactivates the previous one.

**Blocked by:** 01 — Project scaffold + Buyer registration + /balance

**Status:** ready-for-agent

- [x] Drizzle migration creates the `bank_accounts` table (`id` UUID PK, `card_number` VARCHAR(16) NOT NULL, `card_holder_name` VARCHAR NOT NULL, `bank_name` VARCHAR NOT NULL, `additional_notes` TEXT nullable, `is_active` BOOLEAN NOT NULL DEFAULT false, `created_at` TIMESTAMPTZ NOT NULL).
- [x] Bank account service: `setActiveAccount(fields)` wraps the following in a single transaction — sets `is_active = false` on all existing rows, then inserts a new row with `is_active = true`. At commit, exactly one row has `is_active = true`.
- [ ] Bank account service: `getActiveAccount()` returns the single row where `is_active = true`, or `null` if none exists.
- [ ] `/setcard` Admin command uses the grammY `conversations` plugin to collect fields in sequence: card number (16-digit validation), card holder name (non-empty), bank name (non-empty), and optional additional notes (user may skip with a designated keyword or empty message). The conversation can be cancelled at any step.
- [ ] After all fields are collected, the bot shows a confirmation summary and calls `setActiveAccount`.
- [ ] `/setcard` is silently ignored when sent by a non-Admin.
- [ ] Bank account service tests cover: setting a first account, setting a second account (first is deactivated, second is active, both rows persist), `getActiveAccount` returns the active row, `getActiveAccount` returns `null` on an empty table.
