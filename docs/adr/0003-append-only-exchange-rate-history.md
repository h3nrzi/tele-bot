# Append-only exchange rate history table

Exchange rates are stored as append-only rows in an `exchange_rates` table rather than a single mutable configuration value. Each Top-Up Request stores a foreign key (`exchange_rate_id`) pointing to the rate row that was active at the moment of initiation, permanently locking in the rate for that request.

Alternatives considered:

- **`settings` key/value table** (single mutable row): Simple, but destroys rate history and requires a separate snapshot mechanism to answer "what rate applied to this request?"
- **Environment variable**: Immutable within a deployment, useless given IRR's volatility — changing the rate would require a redeploy.

The append-only table costs one extra row per rate change (rare) and gives full audit history at zero query-time cost. The FK on `top_up_requests` makes the locked-in rate permanently auditable and join-free.
