# Append-only double-entry ledger with SYSTEM_CASH contra account

Every Top-Up approval writes exactly two Ledger Entries in a single atomic Ledger Transaction: a credit to `BUYER_WALLET` and a corresponding debit to a virtual `SYSTEM_CASH` account. All ledger rows are immutable — no updates or deletes are permitted on `ledger_transactions` or `ledger_entries` ever.

We considered a simpler single-entry credit log (one row per top-up approval). We chose double-entry because:

1. The ledger is self-balancing: `SUM(credits) - SUM(debits) = 0` is a cheap correctness invariant that can be checked at any time.
2. `SYSTEM_CASH` makes the provenance of every credit answerable without joining external tables — essential for future reconciliation and financial reporting.
3. It matches standard accounting practice, making the schema legible to any accountant or auditing tool without translation.

The cost is one extra row per approval event, which is negligible.
