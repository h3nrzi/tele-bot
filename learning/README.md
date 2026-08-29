# 📚 Tele-Bot Learning Curriculum: Build a Production Telegram Marketplace Bot from Scratch

Welcome to the **Tele-Bot Master Learning Guide**! This comprehensive curriculum guides you through building a high-reliability, Telegram-native marketplace bot with a double-entry financial ledger, materialized wallet balances, and admin-supervised card-to-card top-up flows.

---

## 🎯 What You Will Build

```
+-------------------------------------------------------------------------------+
|                             Telegram Platform                                 |
|         Buyers (Telegram Users)          Admins (Privileged Operators)        |
+------------------------------------+------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------------+
|                            Presentation Layer                                 |
|  - grammY Bot Framework & BotContext                                          |
|  - Multi-step Conversations (@grammyjs/conversations)                         |
|  - Admin Role-Based Middleware                                                |
|  - Inline Action Keyboards & Navigation Menus                                 |
+------------------------------------+------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------------+
|                           Application & Domain Layer                          |
|  - TopUpService (State machine: INITIATED -> PENDING -> APPROVED | REJECTED)  |
|  - LedgerService (Double-Entry Accounting: SYSTEM_CASH <-> BUYER_WALLET)      |
|  - WalletService (Materialized balances with SELECT FOR UPDATE locking)       |
|  - BuyerService (Atomic registration & wallet creation)                       |
|  - ExchangeRateService (Append-only USD/IRR historical conversion rates)      |
|  - BankAccountService (Single active card destination management)             |
+------------------------------------+------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------------+
|                        Infrastructure & Persistence                           |
|  - TSyringe Dependency Injection Container & Token Inversion of Control       |
|  - Drizzle ORM + PostgreSQL Relational Schemas & Migrations                   |
|  - Value Objects (UsdAmount with decimal.js, IrrAmount with BigInt)           |
|  - Vitest Unit & Integration Test Suites                                      |
+-------------------------------------------------------------------------------+
```

---

## 🧭 Ubiquitous Language & Domain Invariants

Before writing code, understand the core domain entities as defined in [`CONTEXT.md`](file:///Users/hossein/Projects/tele-bot/CONTEXT.md):

| Domain Term | Definition | What to Avoid Calling It |
| :--- | :--- | :--- |
| **Buyer** | A Telegram user registered via `/start`. Identified by UUID; Telegram chat ID is a unique secondary key. | *User, Customer, Client* |
| **Admin** | Privileged operator listed in `ADMIN_IDS`. Configures rates, manages bank accounts, reviews top-ups. Has no wallet. | *Operator, Staff, Moderator* |
| **Top-Up Request** | A Buyer's intent to add funds to their wallet. Progresses through `INITIATED -> PENDING -> APPROVED \| REJECTED \| EXPIRED \| CANCELLED`. | *Deposit, Funding Request* |
| **Receipt** | Proof of bank transfer uploaded as a Telegram photo (`file_id`). Required to move from `INITIATED` to `PENDING`. | *Payment Proof, Screenshot* |
| **Exchange Rate** | Admin-configured USD→IRR conversion rate. Append-only history; locked on a Top-Up Request at initiation. | *FX Rate, Conversion Rate* |
| **Bank Account** | Card-to-Card destination details shown to Buyers during top-up. Exactly one account is active at a time. | *Payment Method, Card* |
| **Wallet** | Per-Buyer account holding an Available Balance in USD. | *Account, Purse* |
| **Available Balance** | Current spendable USD balance. Materialized column updated atomically with ledger entries. | *Balance, Credit, Funds* |
| **Ledger Transaction** | Atomic double-entry event containing exactly two entries (1 Debit, 1 Credit) that net to zero. | *Journal Entry, Transaction* |
| **Ledger Entry** | Single row in the append-only ledger applying a debit or credit to `BUYER_WALLET` or `SYSTEM_CASH`. | *Line, Row, Movement* |
| **SYSTEM_CASH** | Virtual contra account debited whenever a Buyer Wallet is credited. Exists solely to balance the ledger. | *Escrow, Float, Reserve* |

---

## 🏛️ Architectural Decision Records (ADRs)

Every major architectural choice in this repository is backed by an ADR:

- [`ADR-0001`](file:///Users/hossein/Projects/tele-bot/docs/adr/0001-append-only-double-entry-ledger-with-system-cash.md): **Append-only double-entry ledger with `SYSTEM_CASH` contra account.**
- [`ADR-0002`](file:///Users/hossein/Projects/tele-bot/docs/adr/0002-materialized-wallet-balance-with-pessimistic-locking.md): **Materialized wallet balance with pessimistic row locking (`SELECT FOR UPDATE`).**
- [`ADR-0003`](file:///Users/hossein/Projects/tele-bot/docs/adr/0003-append-only-exchange-rate-history.md): **Append-only exchange rate history.**
- [`ADR-0004`](file:///Users/hossein/Projects/tele-bot/docs/adr/0004-decimal-js-for-usd-arithmetic.md): **`decimal.js` for arbitrary-precision USD arithmetic (avoiding IEEE-754 float bugs).**
- [`ADR-0005`](file:///Users/hossein/Projects/tele-bot/docs/adr/0005-telegram-file-id-for-receipt-storage.md): **Telegram `file_id` for receipt storage (no external object store required).**

---

## 📖 Curriculum Outline

Follow these lessons sequentially:

1. [**Lesson 01: Domain Modeling & Shared Primitives**](file:///Users/hossein/Projects/tele-bot/learning/01-domain-and-primitives/README.md)
   *Value Objects (`UsdAmount`, `IrrAmount`), currency conversion utils, domain error taxonomy, Telegram helpers.*
2. [**Lesson 02: Relational Database Schema & Drizzle Migrations**](file:///Users/hossein/Projects/tele-bot/learning/02-database-schema-and-migrations/README.md)
   *PostgreSQL tables (`buyers`, `wallets`, `ledger_transactions`, `ledger_entries`, `exchange_rates`, `bank_accounts`, `top_up_requests`), Drizzle ORM relations, migration runner.*
3. [**Lesson 03: Dependency Injection Architecture with TSyringe**](file:///Users/hossein/Projects/tele-bot/learning/03-dependency-injection-and-tokens/README.md)
   *Inversion of Control, `TOKENS` constants, repository interface abstractions with `DbExecutor`, container setup.*
4. [**Lesson 04: Financial Core — Double-Entry Ledger & Materialized Wallet Balance**](file:///Users/hossein/Projects/tele-bot/learning/04-double-entry-ledger-and-wallet/README.md)
   *Double-entry transactions, `SYSTEM_CASH` contra account, pessimistic locking (`FOR UPDATE`), balance mutation safety.*
5. [**Lesson 05: Supporting Modules — Exchange Rates, Bank Accounts & Buyer Registration**](file:///Users/hossein/Projects/tele-bot/learning/05-exchange-rate-and-bank-account/README.md)
   *Append-only USD/IRR rates, active destination bank card management, atomic buyer onboarding.*
6. [**Lesson 06: Top-Up Request Lifecycle, State Machine & Admin Approval Workflow**](file:///Users/hossein/Projects/tele-bot/learning/06-buyer-registration-and-top-up-lifecycle/README.md)
   *Initiation limits, rate/account freeze, receipt photo submission, atomic admin approval/rejection, resilient buyer notifications.*
7. [**Lesson 07: Telegram Bot Setup, Admin Middleware & Keyboards**](file:///Users/hossein/Projects/tele-bot/learning/07-grammy-bot-middleware-and-keyboards/README.md)
   *grammY bot context, admin authorization guard, reply menus, inline approval/rejection buttons, bot command registry.*
8. [**Lesson 08: Interactive Bot Conversations, Handlers & Composers**](file:///Users/hossein/Projects/tele-bot/learning/08-conversations-and-handlers/README.md)
   *Multi-step wizard for top-up initiation and receipt capture, admin approval workflow callbacks, rejection reason dialogs.*
9. [**Lesson 09: Application Bootstrap, Test Harness & Deployment**](file:///Users/hossein/Projects/tele-bot/learning/09-application-bootstrap-and-testing/README.md)
   *Wiring everything into `src/index.ts`, graceful shutdown, Vitest integration testing harness, production checklist.*

---

## 🛠️ Prerequisites & Local Setup

### System Requirements
- **Node.js**: `v22.x` or higher
- **PostgreSQL**: `v15.x` or higher
- **pnpm** or **npm**

### Environment Configuration
Create a `.env` file at the project root:
```env
BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
ADMIN_IDS=123456789,987654321
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tele_bot
TOPUP_MIN_USD=10.00
TOPUP_MAX_USD=1000.00
TOPUP_EXPIRY_MINUTES=30
```

### Running Tests
Verify your implementation at each lesson with:
```bash
npm test
```
