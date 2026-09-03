# Nullable order_id FK with XOR CHECK and self-referential reversal link on ledger_transactions

`ledger_transactions` now carries two nullable source-event FKs — `top_up_request_id` and `order_id` — with a `CHECK ((top_up_request_id IS NULL) != (order_id IS NULL))` constraint that enforces exactly one per row. A third nullable self-referential column, `reversed_by_ledger_transaction_id`, links an original debit transaction to its refund transaction when an Order is rejected or cancelled.

We considered a generic `source_type ENUM` + `source_id UUID` pair instead of typed FKs. We rejected it because it sacrifices referential integrity (no FK enforcement on a polymorphic UUID) and makes the source of any ledger row unverifiable by the database. Typed nullable FKs with a XOR CHECK give both FK integrity and a clear extension point: adding a third source event type in a future RFP requires adding one nullable FK column and widening the CHECK — a migration, not a redesign.

The self-referential `reversed_by_ledger_transaction_id` makes refund relationships queryable without scanning `narrative` text. It is set on the *original debit* row when the refund transaction is written, preserving the ledger's append-only invariant (ADR-0001): neither the original entries nor the refund entries are ever modified.
