# Materialized wallet balance with pessimistic row-level locking

The `wallets` table holds a materialized `available_balance` column. Every operation that reads or modifies a Buyer's balance (Top-Up approval, future order spend) must first acquire a `SELECT ... FOR UPDATE` lock on the wallet row, then read the balance, compute the new value, write the Ledger Entry, and update the column — all within a single PostgreSQL transaction.

Alternatives considered:

- **Compute on-the-fly**: `SELECT SUM(amount) FROM ledger_entries WHERE ...` on every balance check. Always correct by definition, but requires a full ledger scan per request — increasingly expensive as the ledger grows.
- **Optimistic locking with retry**: Read balance, attempt update with `WHERE balance = $snapshot`, retry on conflict. No lock contention, but retry logic in async TypeScript is error-prone and adds latency on hot wallets.

Pessimistic locking was chosen because:
1. The wallet row is already the natural serialization point for all balance mutations.
2. Balance reads happen on every top-up initiation and order flow — the scan cost of on-the-fly computation compounds quickly.
3. `SELECT FOR UPDATE` is a single-line addition to the query and eliminates the negative-balance race condition class entirely.
