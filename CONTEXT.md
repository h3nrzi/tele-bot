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
The USD→IRR conversion rate used to price Top-Up Requests. Stored as an append-only history. In Manual Rate Mode, Admins set the rate directly. In Auto-Sync Rate Mode, the system ingests rates from Wallex. The rate applied to a given Top-Up Request is locked inline at the moment of initiation (`locked_irr_per_usd`) and never changes thereafter.
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
A virtual contra account debited whenever a Buyer Wallet is credited on Top-Up approval, and credited whenever a Buyer Wallet is debited on Order placement or refunded on Order cancellation/rejection. Has no real-world counterpart; exists solely to balance the double-entry ledger.
_Avoid_: Escrow, Float, Reserve

### Service Catalog & Ordering

**Catalog Item**:
A named, Admin-configured purchasable item with a fixed USD price and an optional description. The canonical record of what Buyers can buy. Active Catalog Items appear in the Buyer's `/shop` view; inactive ones do not, but their history is preserved.
_Avoid_: SKU, Product, Service, Listing

**Order**:
A Buyer's purchase of exactly one unit of one Catalog Item. Created atomically with a wallet debit and a Ledger Transaction at the moment the Buyer confirms. Progresses through the states: `PLACED → PROCESSING → FULFILLED | REJECTED | CANCELLED`.
_Avoid_: Purchase, Transaction, Request

**Price Snapshot**:
The USD price of a Catalog Item copied onto the Order row at the moment of placement and never subsequently updated. Guarantees the financial record of an Order is immutable regardless of future Catalog Item price changes.
_Avoid_: Locked price, Historical price

**Claim**:
The act of an Admin transitioning an Order from `PLACED` to `PROCESSING` by tapping `[▶ Start Processing]`. Claiming is instantaneous, requires no conversation, and locks Buyer cancellation. Only one Admin may claim a given Order.
_Avoid_: Assignment, Pickup, Take

**Delivery Content**:
The plain-text credentials, keys, or access information typed by the claiming Admin during the fulfilment conversation and forwarded to the Buyer upon Order fulfilment. Stored permanently in `orders.delivery_content` for audit purposes.
_Avoid_: Credentials, Payload, Fulfilment data

**Order Admin Notification**:
The Telegram push message sent to each Admin when an Order is placed. Its `chat_id` and `message_id` are stored in `order_admin_notifications` so that claim, cancellation, rejection, and fulfilment services can edit the message's inline buttons to reflect the current Order state.
_Avoid_: Alert, Broadcast, Push

### Account Hub

**Account Hub**:
The buyer-facing feature that aggregates a Buyer's identity data, Available Balance, order metrics, and transaction history into a centralised view. Accessed via the `👤 حساب کاربری` main-menu button or the `/account` command.
_Avoid_: Profile, Dashboard, My Account

**Profile Card**:
The landing message of the Account Hub. Displays read-only Buyer identity (Telegram ID, username, registration date), Available Balance, an order status breakdown, and a Top-Up Request alert banner when an active Top-Up Request (`INITIATED` or `PENDING`) exists. Implemented as a single Telegram message with inline buttons that drill into Order History and Transaction History without replacing the main Reply Keyboard.
_Avoid_: Account Card, Summary Card, Profile Page

### Wallex Integration

**Rate Mode**:
The system-wide toggle that determines how Exchange Rates are sourced: `MANUAL` (Admin enters rates directly) or `AUTO_SYNC` (rates are fetched from the Wallex OTC pricing engine with an Admin-configured Spread applied). Stored in `exchange_rate_config`.
_Avoid_: Pricing Mode, Rate Type, Rate Source

**Spread**:
The Admin-configured percentage markup applied on top of the raw Wallex OTC buy price before presenting the buyer-facing Exchange Rate. Absorbs operational costs, Wallex fees, and volatility risk.
_Avoid_: Margin, Markup, Commission, Fee

**OTC Quote**:
A transient, on-demand price fetched from the Wallex OTC endpoint (`GET /v1/account/otc/price`) at the moment a Buyer initiates a Top-Up Request in Auto-Sync Rate Mode. The quote (with Spread applied) is locked inline on the Top-Up Request and is not persisted in the `exchange_rates` table.
_Avoid_: Live Rate, Real-time Rate, Spot Price

**Baseline Rate**:
An Exchange Rate row inserted by the periodic background sync job (every 60 minutes in Auto-Sync Rate Mode). Serves as the fallback rate when an on-demand OTC Quote fetch fails or times out during Top-Up initiation.
_Avoid_: Fallback Rate, Sync Rate, Background Rate

**OTC Purchase**:
An automated Wallex OTC market buy of USDT triggered asynchronously after an Admin approves a Top-Up Request. Records the execution result (Wallex order ID, executed price, quantity, fees) or failure details. Progresses through the states: `PENDING → COMPLETED | FAILED`.
_Avoid_: Wallex Order, Exchange Order, Trade
