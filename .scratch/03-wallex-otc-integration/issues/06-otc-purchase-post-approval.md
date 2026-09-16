# 06: OTC Purchase — Post-Approval Auto-Buy & Retry

**What to build:** The `OtcPurchaseService` domain module and its integration into the post-approval flow, so that after an Admin approves a Top-Up Request and the Buyer's wallet is credited, the system automatically executes a Wallex OTC market buy and reports the result. Demoable: approve a top-up → receive an OTC purchase success/failure notification in the ops group → tap Retry on a failure → see a new attempt.

- **`src/modules/otc-purchase/`** — Domain module with `OtcPurchase` entity (state machine: `PENDING → COMPLETED | FAILED`), Drizzle schema (from ticket 02), repository, and `OtcPurchaseService`.

- **`OtcPurchaseService.execute(topUpRequest)`** — Inserts a PENDING row, fetches a fresh OTC price quote via `WallexClient`, places the OTC order within the 15s TTL, transitions to COMPLETED (with Wallex execution details) or FAILED (with error message). The partial unique index prevents duplicate PENDING/COMPLETED rows per Top-Up Request.

- **`OtcPurchaseService.retry(failedPurchaseId)`** — Inserts a new PENDING row for the same `top_up_request_id` (preserving the failed row for audit) and re-executes.

- **Post-approval trigger** — `ApproveTopUpDependencies` extended with an optional `executeOtcPurchase` callback. After the approval DB transaction commits, the callback fires `OtcPurchaseService.execute()` asynchronously (fire-and-forget). OTC execution never blocks or delays the Buyer's wallet credit.

- **Notifications** — Success: detailed message to `TELEGRAM_OPS_GROUP_ID` (or Admin DMs) with USDT received, TMN spent, executed price, fee, Wallex order ID. Failure: error details + inline `[🔁 Retry]` button.

- **Retry handler** — `callbackQuery(/^otc:retry:(.+)$/)` in the admin composer parses the failed purchase ID and calls `OtcPurchaseService.retry()`.

**Blocked by:** 02 (wallex_otc_purchases table), 05 (modified approval flow with locked rate data).

**Status:** completed

- [x] `OtcPurchase` entity with `PENDING → COMPLETED | FAILED` state machine
- [x] `OtcPurchaseRepository` with insert, update, and find methods
- [x] `OtcPurchaseService.execute()` coordinates quote → order → record result
- [x] `OtcPurchaseService.retry()` inserts new PENDING row and re-executes
- [x] Partial unique index prevents concurrent PENDING/COMPLETED rows per Top-Up Request
- [x] `ApproveTopUpDependencies` extended with `executeOtcPurchase` callback
- [x] Fire-and-forget invocation after approval commit — wallet credit never blocked
- [x] Success notification with execution details to ops group or Admin DMs
- [x] Failure notification with error details and inline Retry button
- [x] `otc:retry` callback handler in admin composer
- [x] `TELEGRAM_OPS_GROUP_ID` env var wired with fallback to `ADMIN_IDS`
- [x] DI tokens and container registrations for new repository and service
- [x] Integration tests: happy path, Wallex failure, retry, duplicate prevention, fire-and-forget resilience
