# 01: Project scaffold + Buyer registration + /balance

**What to build:** A Buyer sends `/start` to a running Telegram bot for the first time and receives a welcome message confirming their account is created. If they send `/start` again, the bot greets them by name and shows their current Available Balance ($0.00). Sending `/balance` at any time shows their current Available Balance. The project is wired end-to-end: TypeScript, grammY (long-polling), PostgreSQL via Drizzle ORM, `decimal.js` for money, environment-variable config, and a test harness that runs the Registration service against a real PostgreSQL test database.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] TypeScript project initialised with strict mode; grammY, Drizzle ORM, `decimal.js`, `dotenv`, and a test runner installed and configured.
- [x] Drizzle migration creates the `users` table (`id` UUID PK, `telegram_chat_id` BIGINT UNIQUE NOT NULL, `telegram_username` VARCHAR nullable, `created_at` TIMESTAMPTZ) and the `wallets` table (`id` UUID PK, `user_id` UUID FK → `users` UNIQUE NOT NULL, `available_balance` NUMERIC(18,2) NOT NULL DEFAULT 0.00, `updated_at` TIMESTAMPTZ).
- [x] Migration is committed to the repository and applied automatically before the test suite runs.
- [ ] Test harness connects to a real PostgreSQL test database and truncates all tables between each test.
- [ ] Registration service creates a `users` row and a `wallets` row atomically in a single transaction; the wallet starts with `available_balance = 0.00`.
- [ ] Registration service is idempotent: calling it twice with the same `telegram_chat_id` returns the existing user and wallet without error and without creating duplicate rows.
- [ ] `/start` handler: a new Buyer receives a welcome message; a returning Buyer receives a personalised message that includes their current Available Balance.
- [ ] `/balance` handler: returns the Buyer's current Available Balance formatted as a USD string (e.g., `$0.00`).
- [ ] `/start` and `/balance` are silently ignored for unrecognised senders until registration is complete (i.e., `/balance` before `/start` prompts the user to register first).
- [ ] Registration service tests cover: new Buyer happy path, returning Buyer idempotency, and concurrent `/start` from the same Telegram ID producing exactly one `users` row and one `wallets` row.
- [ ] Bot process starts without errors and responds to `/start` in a live Telegram environment (smoke-test only; not automated).
