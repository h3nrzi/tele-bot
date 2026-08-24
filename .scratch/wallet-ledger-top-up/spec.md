# RFP #1: Wallet Ledger & Top-Up Engine

Status: ready-for-agent

---

## Problem Statement

Buyers interacting with the Telegram bot have no way to hold funds or fund an account. When a Buyer wants to make a purchase, there is no wallet to debit. Admins have no mechanism inside Telegram to receive notification of manual Card-to-Card bank transfers, verify the attached receipt, and credit the correct Buyer's account. There is no financial audit trail — every credit, balance state, and exchange rate that applied to a historical transaction is invisible after the fact.

## Solution

Build a Telegram-native USD wallet system with a full top-up flow and an immutable double-entry ledger as the financial foundation of the MVP.

A Buyer sends `/start` to register, which creates their account and a zero-balance USD Wallet in one atomic step. When they want to add funds, they specify a USD amount; the bot locks the current Admin-configured Exchange Rate, computes the exact IRR amount to transfer, and displays the Bank Account card details. The Buyer completes the Card-to-Card bank transfer in their banking app, then uploads a receipt photo (with an optional caption) to the bot. This transitions their Top-Up Request to `PENDING` and instantly pushes a notification — including the receipt photo and inline Approve / Reject buttons — to every configured Admin.

The Admin reviews the photo against the claimed amounts, selects a preset rejection reason or writes a custom one, or taps Approve. Approval writes a paired double-entry Ledger Transaction (debit `SYSTEM_CASH`, credit `BUYER_WALLET`) atomically with an update to the Buyer's materialized Available Balance, protected by pessimistic row-level locking to prevent race conditions across concurrent Admin actions. The Buyer is instantly notified of the outcome. Every Exchange Rate ever set, every Ledger Entry ever written, and every approval or rejection decision is permanently recorded and auditable.

---

## User Stories

### Buyer — Registration

1. As a Buyer, I want to send `/start` to the bot so that my account and a zero-balance Wallet are created automatically in a single step.
2. As a returning Buyer, I want `/start` to recognise me and show my current Available Balance in the greeting so that I get an immediate balance anchor without typing a separate command.

### Buyer — Top-Up Initiation

3. As a Buyer, I want to provide a USD amount to top up so that I can specify exactly how much credit I need.
4. As a Buyer, I want the bot to show me the exact IRR amount I need to transfer (converted at the locked Exchange Rate) so that I know precisely what to send before I open my banking app.
5. As a Buyer, I want to see the full Bank Account details — card number, card holder name, bank name, and any special transfer instructions — during initiation so that I can copy them directly without asking elsewhere.
6. As a Buyer, I want the Exchange Rate to be locked at the moment I initiate the request so that my IRR obligation does not change while I am completing the bank transfer.
7. As a Buyer, I want to be told if the USD amount I entered is below the minimum or above the maximum allowed so that I can correct it before any transfer is made.
8. As a Buyer, I want to see a clear, friendly message if top-up is temporarily unavailable (no Exchange Rate configured) so that I understand it is a system issue and not my error.
9. As a Buyer, I want to be prevented from opening a second Top-Up Request while I already have an active one so that I do not accidentally make duplicate bank transfers.

### Buyer — Receipt Submission

10. As a Buyer, I want to upload a photo of my bank transfer receipt so that I can prove the transfer was completed.
11. As a Buyer, I want to include a text caption with my receipt photo so that I can supply the transaction reference number or any additional details the Admin might need.
12. As a Buyer, I want to be told clearly if my Top-Up Request has expired before I submit my receipt so that I know I must start a new request rather than wait.

### Buyer — Cancellation

13. As a Buyer, I want to cancel my Top-Up Request before I have uploaded a receipt so that I can start over with a corrected amount or different timing.
14. As a Buyer, I want to be prevented from cancelling a request once my receipt is under Admin review so that the Admin's in-progress inspection is not disrupted.

### Buyer — Notifications

15. As a Buyer, I want an instant Telegram message when my Top-Up is approved, showing the credited USD amount and my updated Available Balance, so that I know immediately that my Wallet has been funded.
16. As a Buyer, I want an instant Telegram message when my Top-Up is rejected, including the full rejection category and any custom Admin note, so that I understand exactly what went wrong and how to resubmit correctly.

### Buyer — Balance & Status

17. As a Buyer, I want to check my current Available Balance via `/balance` so that I can see my spendable funds at any time.
18. As a Buyer, I want to check the status of my most recent Top-Up Request via `/status` so that I can see whether it is waiting for a receipt, under Admin review, approved, or rejected.

### Admin — Exchange Rate Management

19. As an Admin, I want to set the USD→IRR Exchange Rate via `/setrate <irr_amount>` so that Buyers see accurate IRR transfer amounts during top-up initiation.
20. As an Admin, I want to view the current active Exchange Rate via `/rate` so that I can confirm what rate Buyers are being shown before changing it.
21. As an Admin, I want every Exchange Rate change to be permanently recorded with a timestamp and my Telegram identity so that any historical Top-Up Request can be audited against the rate that applied at the time.

### Admin — Bank Account Management

22. As an Admin, I want to configure the Bank Account details (card number, holder name, bank name, and optional transfer instructions) via `/setcard` so that Buyers always receive accurate Card-to-Card transfer destinations.
23. As an Admin, I want the bot to enforce a single active Bank Account at any time so that Buyers never see conflicting payment destinations.

### Admin — Top-Up Review

24. As an Admin, I want to receive an instant Telegram push notification — including the receipt photo, Buyer-requested USD amount, and IRR amount instructed — the moment a Buyer submits their receipt so that I can start reviewing without delay.
25. As an Admin, I want inline Approve and Reject buttons directly in the notification message so that I can act in one tap without navigating to a separate command.
26. As an Admin, I want to see all currently `PENDING` Top-Up Requests via `/pending` so that I have a full queue view and nothing falls through the cracks.
27. As an Admin, I want to approve a Top-Up Request with a single tap so that the Buyer's Wallet is credited immediately and without friction.
28. As an Admin, I want to reject a Top-Up Request by selecting a preset reason (e.g., "Wrong amount", "Unreadable receipt", "Duplicate submission") so that common rejections are fast and consistent.
29. As an Admin, I want to add a custom free-text note when rejecting so that I can give the Buyer specific, actionable guidance that goes beyond a preset category.
30. As an Admin, I want the system to prevent me from approving or rejecting a request that another Admin has already processed so that no Buyer is double-credited and no decision is silently overwritten.
31. As an Admin, I want an urgent alert pushed to my Telegram when a Buyer tries to initiate a Top-Up but no Exchange Rate has been configured so that I can set one immediately via `/setrate`.

### System Integrity

32. As the system, I want a Buyer's Wallet to be protected by a pessimistic row-level lock during every balance mutation so that negative balances are impossible even under concurrent Admin approvals.
33. As the system, I want every balance change to be recorded as an immutable, append-only pair of Ledger Entries (a debit to `SYSTEM_CASH` and a credit to `BUYER_WALLET`) so that the complete financial history is always auditable and self-balancing.
34. As the system, I want the Exchange Rate and IRR amount to be immutably locked onto each Top-Up Request at the moment of initiation so that the Buyer's agreed transfer obligation is permanently preserved, regardless of subsequent rate changes.
35. As the system, I want a database-level constraint to enforce at most one non-terminal Top-Up Request per Buyer at any time so that the one-active-request rule cannot be violated even under concurrent bot updates.
36. As the system, I want the Ledger to be append-only — no update or delete on Ledger Transactions or Ledger Entries is ever permitted — so that the audit trail is tamper-proof by construction.

---

## Implementation Decisions

### Modules

The following application service modules will be built. Each module is a set of async TypeScript functions that take typed inputs, interact with the database via Drizzle, and return typed outputs. grammY bot handlers call these functions and are responsible only for Telegram context parsing and reply formatting.

- **Registration service**: create user + wallet atomically on `/start`; return existing user with balance for returning Buyers.
- **Top-Up initiation service**: validate amount bounds, fetch active Exchange Rate, compute and store IRR amount, create Top-Up Request with `expires_at`.
- **Receipt submission service**: validate `INITIATED` status and `expires_at`, transition to `PENDING`, trigger Admin notifications.
- **Cancellation service**: validate request is in `INITIATED` status, transition to `CANCELLED` (terminal).
- **Admin approval service**: acquire locks, verify `PENDING` status, write Ledger Transaction + Ledger Entries, update Available Balance, mark request `APPROVED`, trigger Buyer notification.
- **Admin rejection service**: acquire request lock, verify `PENDING` status, persist rejection reason, mark request `REJECTED`, trigger Buyer notification.
- **Exchange rate service**: append a new Exchange Rate row, query the current active rate.
- **Bank account service**: deactivate existing active account, insert new active Bank Account.
- **Buyer status service**: fetch the most recent Top-Up Request for a Buyer with its current status.
- **Admin queue service**: list all `PENDING` Top-Up Requests for the `/pending` command.
- **Notification service**: push messages to Buyer chat IDs and Admin chat IDs; fire-and-forget after DB commit.

### Database Schema

Seven tables form the complete schema for this RFP. All IDs are UUIDs. All timestamps are `TIMESTAMPTZ`.

**`users`**
| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | Surrogate identity |
| `telegram_chat_id` | `BIGINT` UNIQUE NOT NULL | Telegram-assigned, used for push notifications |
| `telegram_username` | `VARCHAR` nullable | Display only |
| `created_at` | `TIMESTAMPTZ` NOT NULL | |

**`wallets`**
| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `user_id` | `UUID` FK → `users` UNIQUE NOT NULL | One wallet per Buyer |
| `available_balance` | `NUMERIC(18,2)` NOT NULL DEFAULT `0.00` | Materialized; protected by `SELECT FOR UPDATE` |
| `updated_at` | `TIMESTAMPTZ` NOT NULL | |

**`exchange_rates`**
| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `irr_per_usd` | `BIGINT` NOT NULL | Integer IRR units per 1 USD |
| `created_by_admin_telegram_id` | `BIGINT` NOT NULL | Audit: which Admin set it |
| `created_at` | `TIMESTAMPTZ` NOT NULL | Most recent row = active rate |

Append-only: no updates or deletes permitted.

**`bank_accounts`**
| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `card_number` | `VARCHAR(16)` NOT NULL | |
| `card_holder_name` | `VARCHAR` NOT NULL | |
| `bank_name` | `VARCHAR` NOT NULL | |
| `additional_notes` | `TEXT` nullable | Optional transfer instructions |
| `is_active` | `BOOLEAN` NOT NULL DEFAULT `false` | Exactly one row `true` at any time |
| `created_at` | `TIMESTAMPTZ` NOT NULL | |

**`top_up_requests`**
| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `user_id` | `UUID` FK → `users` NOT NULL | |
| `exchange_rate_id` | `UUID` FK → `exchange_rates` NOT NULL | Rate locked at initiation |
| `usd_amount` | `NUMERIC(18,2)` NOT NULL | Buyer-requested amount |
| `irr_amount` | `BIGINT` NOT NULL | `usd_amount × irr_per_usd` at initiation |
| `status` | `ENUM` NOT NULL | `INITIATED \| PENDING \| APPROVED \| REJECTED \| EXPIRED \| CANCELLED` |
| `receipt_file_id` | `VARCHAR` nullable | Telegram photo `file_id` |
| `receipt_caption` | `TEXT` nullable | Optional Buyer text alongside photo |
| `rejection_reason` | `TEXT` nullable | Populated on `REJECTED` |
| `expires_at` | `TIMESTAMPTZ` NOT NULL | `INITIATED` window deadline |
| `processed_by_admin_telegram_id` | `BIGINT` nullable | Audit: which Admin acted |
| `processed_at` | `TIMESTAMPTZ` nullable | When Admin acted |
| `created_at` | `TIMESTAMPTZ` NOT NULL | |
| `updated_at` | `TIMESTAMPTZ` NOT NULL | |

**Partial unique index** on `top_up_requests(user_id) WHERE status IN ('INITIATED', 'PENDING')` — enforces the one-active-request-per-Buyer rule at the database level.

**`ledger_transactions`**
| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | Groups a paired debit + credit |
| `top_up_request_id` | `UUID` FK → `top_up_requests` nullable | Source event |
| `narrative` | `TEXT` NOT NULL | Human-readable description |
| `created_at` | `TIMESTAMPTZ` NOT NULL | |

**`ledger_entries`**
| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `ledger_transaction_id` | `UUID` FK → `ledger_transactions` NOT NULL | |
| `account_type` | `ENUM` NOT NULL | `BUYER_WALLET \| SYSTEM_CASH` |
| `direction` | `ENUM` NOT NULL | `DEBIT \| CREDIT` |
| `usd_amount` | `NUMERIC(18,2)` NOT NULL | Always positive |
| `wallet_id` | `UUID` FK → `wallets` nullable | Non-null for `BUYER_WALLET` entries |
| `created_at` | `TIMESTAMPTZ` NOT NULL | |

Both ledger tables: **no UPDATE or DELETE permitted**. This constraint is enforced at the application layer; a database-level trigger may be added for defence-in-depth.

### Approval Transaction Sequence

Every Top-Up approval executes the following steps inside a single PostgreSQL transaction:

1. `SELECT … FROM top_up_requests WHERE id = ? FOR UPDATE` — locks the request row.
2. Assert `status = 'PENDING'`; abort with "already processed" if not (multi-Admin race guard).
3. `SELECT … FROM wallets WHERE user_id = ? FOR UPDATE` — locks the Wallet row.
4. Insert one `ledger_transactions` row.
5. Insert two `ledger_entries` rows: `DEBIT SYSTEM_CASH` and `CREDIT BUYER_WALLET` for the same `usd_amount`.
6. `UPDATE wallets SET available_balance = available_balance + ?, updated_at = now()`.
7. `UPDATE top_up_requests SET status = 'APPROVED', processed_by_admin_telegram_id = ?, processed_at = now()`.
8. Commit.
9. Push Buyer notification (outside transaction, fire-and-forget).

### Money Arithmetic

All USD arithmetic in the TypeScript application layer uses the `decimal.js` library. Drizzle returns `NUMERIC(18,2)` columns as JavaScript strings; these are wrapped in `new Decimal(str)` at the DB boundary and written back via `.toFixed(2)`. JavaScript's native `number` type is never used for USD arithmetic. IRR amounts are computed as `usdDecimal.times(irrPerUsd).toFixed(0)` and stored as `BIGINT`.

### Exchange Rate Locking

At Top-Up initiation, the service queries `SELECT * FROM exchange_rates ORDER BY created_at DESC LIMIT 1`. If no row is found: return a user-friendly error to the Buyer and push an urgent alert to all `ADMIN_IDS`. If a row is found: compute `irr_amount`, store the `exchange_rate_id` FK, and create the request. The rate is never re-read after the request row is written.

### Expiry

The `INITIATED` expiry window is controlled by the `TOPUP_INITIATED_EXPIRY_MINUTES` environment variable (default: 30). `expires_at = created_at + interval`. No background job: when the Buyer attempts to submit their receipt, the service checks `expires_at < now()` and, if true, transitions the request to `EXPIRED` and returns an error prompting the Buyer to start a new request.

### Admin Identity & Middleware

Admin identity is determined by a grammY middleware layer that checks the incoming `ctx.from.id` against the list of IDs parsed from the `ADMIN_IDS` environment variable (comma-separated). No database read is performed for auth. Admin-only handlers return silently for non-Admin callers.

### Bot Architecture

- **Long-polling** mode for MVP; no HTTPS endpoint or webhook infrastructure required.
- **grammY `conversations` plugin** is used for transient multi-step flows only: the Admin rejection reason prompt and the `/setcard` setup flow.
- **Database state** drives all long-lived lifecycle transitions (`INITIATED → PENDING → APPROVED / REJECTED / EXPIRED`). Bot restarts do not affect pending requests.
- grammY handlers contain no business logic: they parse Telegram context, call the appropriate service, and format the reply. All conditionals live in the service layer.

### Admin Command Surface (RFP #1)

| Command | Description |
|---|---|
| `/setrate <irr_amount>` | Appends a new Exchange Rate row; the new rate is active immediately |
| `/rate` | Displays the current active Exchange Rate |
| `/setcard` | Opens a grammY conversation to configure the active Bank Account |
| `/pending` | Lists all `PENDING` Top-Up Requests with inline Review buttons |

### Amount Validation

At initiation, `usd_amount` is validated against `TOPUP_MIN_USD` and `TOPUP_MAX_USD` environment variables using `decimal.js` comparison. Both are required for the service to operate. Validation rules are isolated in a dedicated validation module designed to accept additional rules (e.g., per-user limits or KYC tiers) in later RFPs without touching the initiation service core.

---

## Testing Decisions

### What Makes a Good Test

Tests cover observable external behaviour only — the state of the database after a service call, the return value of the service function, and the errors it raises. Tests do not assert on which Drizzle methods were invoked, how many SQL queries were issued, or any other internal implementation detail. A good test reads like a business scenario, not a unit test of a method.

### Seam

All tests call application service functions directly against a **real PostgreSQL test database**. The grammY bot layer, Telegram API, and notification dispatch are not involved in any test. Each test suite starts with a clean database state (truncate all tables between tests or use transaction rollback isolation).

### Modules Covered

| Module | Key scenarios tested |
|---|---|
| Registration service | New Buyer: user + wallet created atomically; returning Buyer: existing record returned with balance; concurrent `/start` from same Telegram ID is idempotent |
| Top-Up initiation service | Happy path; amount below minimum rejected; amount above maximum rejected; no active Exchange Rate returns correct error; second initiation while `INITIATED` request active is rejected by partial unique index |
| Receipt submission service | Happy path `INITIATED → PENDING`; expired request (`expires_at` in past) transitions to `EXPIRED` and returns error; wrong status (already `PENDING`) is rejected |
| Cancellation service | `INITIATED` request cancelled successfully; `PENDING` request cancellation rejected |
| Admin approval service | Happy path: ledger rows written, balance updated, request status `APPROVED`; multi-Admin race: second approval on same request returns "already processed" error and writes no ledger rows; balance never goes negative |
| Admin rejection service | Happy path: rejection reason stored, status `REJECTED`; race: second action on already-processed request rejected |
| Exchange rate service | New rate appended; current active rate is the most recently created row |
| Bank account service | New account activates; previous active account deactivated; only one active account at any time |
| Buyer status service | Returns most recent Top-Up Request regardless of status |
| Admin queue service | Returns only `PENDING` requests |

### Prior Art

This is a green-field codebase. The first test module establishes the pattern for all subsequent tests.

---

## Out of Scope

- **Wallet spending**: debiting the Wallet for order placement is a separate RFP.
- **Web admin dashboard**: all Admin interactions are Telegram-only for MVP.
- **Object storage for receipts**: Telegram `file_id` is used for MVP (see ADR-0005 for known risk and migration trigger conditions).
- **Multiple active Bank Accounts**: single active account only; rotation logic deferred.
- **Top-Up history command** (`/history`): only the most recent request is exposed via `/status` in MVP.
- **Admin analytics** (`/stats`, `/user` lookups): deferred to a reporting RFP.
- **Runtime admin management** (adding/removing Admins without redeployment): env-var list only for MVP.
- **Automatic exchange rate fetching** from external sources or APIs.
- **`PENDING` request auto-expiry**: no time-limit on Admin review; Admin must explicitly Approve or Reject.
- **KYC / identity verification** of Buyers.
- **Horizontal scaling / webhook deployment**: long-polling only; revisit when concurrency demands it.
- **Refunds or manual balance adjustments**: no debit operations on Buyer Wallets in this RFP.

---

## Further Notes

- **ADR-0001** documents the double-entry ledger design and the rationale for `SYSTEM_CASH`.
- **ADR-0002** documents the materialized Available Balance and pessimistic locking choice.
- **ADR-0003** documents the append-only Exchange Rate history table.
- **ADR-0004** documents the `decimal.js` decision and the IEEE 754 risk it avoids.
- **ADR-0005** documents the Telegram `file_id` receipt storage trade-off and the conditions under which object storage should be added.
- Drizzle migrations must be committed to the repository and executed as part of every deployment.
- The `TOPUP_INITIATED_EXPIRY_MINUTES` environment variable defaults to 30 in the absence of explicit configuration.
- The `SYSTEM_CASH` account is a virtual contra account with no real-world counterpart; it exists solely to keep the double-entry ledger self-balancing.
