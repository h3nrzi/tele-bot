# decimal.js for all USD financial arithmetic

All USD arithmetic in the TypeScript application layer uses the `decimal.js` library. Drizzle ORM returns PostgreSQL `NUMERIC(18,2)` columns as JavaScript strings to avoid silent precision loss. We never parse these strings to `number` before doing arithmetic.

Why not `number`: IEEE 754 double-precision cannot represent all 2-decimal-place values exactly. For example, `0.1 + 0.2 === 0.30000000000000004` in JavaScript. Applied to financial balances and transfer amounts, this produces silently wrong results — a known and serious bug category.

Alternative considered — **cent-based integer arithmetic** (store amounts as integer cents, divide by 100 for display): Correct, but requires changing the schema from `NUMERIC(18,2)` to `BIGINT` and adds a cognitive translation layer throughout the codebase.

`decimal.js` wraps the string at the DB boundary, makes arithmetic intent explicit in code, and eliminates the precision bug class with a single dependency. All DB writes convert back to string via `.toFixed(2)`.
