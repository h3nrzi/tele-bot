# Tele-Bot

A Telegram-native marketplace bot where Buyers hold a USD wallet balance, fund it via manual Card-to-Card bank transfers, and spend it on orders processed by Admin operators.

## Language

### Users

**Buyer**:
A Telegram user registered via `/start`. The canonical identifier is an internal UUID; the Telegram chat ID is stored as a unique secondary index.
_Avoid_: User, Customer, Client

**Admin**:
A privileged operator whose Telegram chat ID appears in the `ADMIN_IDS` environment variable. Admins configure exchange rates, manage bank accounts, and process Top-Up Requests. Admins are not Buyers and do not hold wallets.
_Avoid_: Operator, Staff, Moderator

### Top-Up Flow

**Top-Up Request**:
A Buyer's intent to add funds to their Wallet. Progresses through the states: `INITIATED → PENDING → APPROVED | REJECTED | EXPIRED`. Only one non-terminal Top-Up Request may exist per Buyer at any time.
_Avoid_: Deposit Request, Funding Request, Charge Request

**Receipt**:
Proof of a completed bank transfer, uploaded by the Buyer as a Telegram photo with an optional text caption. Moving a Top-Up Request from `INITIATED` to `PENDING` requires a Receipt.
_Avoid_: Payment Proof, Screenshot

**Exchange Rate**:
The Admin-configured USD→IRR conversion rate. Stored as an append-only history; the rate is locked onto a Top-Up Request at the moment of initiation and never changes thereafter.
_Avoid_: FX Rate, Conversion Rate

**Bank Account**:
The Card-to-Card transfer destination configured by an Admin and shown to Buyers during top-up initiation. Holds card number, card holder name, bank name, and optional transfer instructions. Exactly one Bank Account is active at a time.
_Avoid_: Card, Payment Method, Destination

### Ledger & Wallet

**Wallet**:
A per-Buyer account that holds an Available Balance. Created with a zero balance when the Buyer first registers.
_Avoid_: Account, Purse

**Available Balance**:
The current spendable USD balance held in a Buyer's Wallet. Materialized as a column on the `wallets` table and updated atomically alongside every Ledger Entry.
_Avoid_: Balance, Credit, Funds

**Ledger Transaction**:
A paired, atomic double-entry event. Each Ledger Transaction contains exactly two Ledger Entries — one debit and one credit — that net to zero. Immutable once written.
_Avoid_: Transaction, Journal Entry, Record

**Ledger Entry**:
A single immutable row in the append-only ledger, belonging to a Ledger Transaction. Records a debit or credit applied to either a `BUYER_WALLET` or `SYSTEM_CASH` account.
_Avoid_: Line, Row, Movement

**SYSTEM_CASH**:
A virtual contra account debited whenever a Buyer Wallet is credited on Top-Up approval. Has no real-world counterpart; exists solely to balance the double-entry ledger.
_Avoid_: Escrow, Float, Reserve
