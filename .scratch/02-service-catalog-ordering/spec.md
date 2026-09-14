# RFP #2: Service Catalog & Ordering Engine

Status: ready-for-agent

---

## Problem Statement

Buyers have funded wallets (RFP #1) but no way to spend them. There is no catalog of purchasable items, no mechanism for a Buyer to place an order and have their wallet debited, and no workflow for Admins to receive, claim, and manually fulfil orders by delivering credentials or access details through Telegram. The financial audit trail established in RFP #1 has no counterpart on the spending side of the ledger.

## Solution

Build a Telegram-native Service Catalog and Ordering Engine on top of the existing wallet and ledger infrastructure.

Admins configure a catalog of fixed-price USD items (SKUs) via an interactive `/catalog` dashboard with inline buttons for add, edit, deactivate, and reactivate. Buyers browse active SKUs via `/shop` — an inline keyboard catalog — select one, and receive a confirmation prompt that shows the SKU name, description, price, and their current Available Balance. If the balance is sufficient, the Buyer taps Confirm: the system atomically debits the wallet, writes a double-entry Ledger Transaction (DEBIT `BUYER_WALLET` + CREDIT `SYSTEM_CASH`), creates an Order at status `PLACED`, and pushes a full-context notification to all configured Admins. The price is permanently snapshotted onto the Order row at this moment.

Each Admin notification carries two inline buttons: `[▶ Start Processing]` and `[✗ Reject]`. Tapping `[▶ Start Processing]` instantly transitions the Order to `PROCESSING`, locks out Buyer cancellation, and edits every Admin's copy of the notification to reflect the claimer's identity and replace the buttons with `[🔒 Processing by @adminX]` and `[📦 Fulfil Order]`. The claiming Admin later taps `[📦 Fulfil Order]` when the credentials are ready, which opens a 3-step grammY conversation: type delivery content → preview & confirm → mark `FULFILLED` and forward the content to the Buyer. Tapping the button always resets any dangling conversation state, starting fresh.

Admins can reject an Order from either `PLACED` or `PROCESSING` via a pure inline keyboard flow: tap `[✗ Reject]`, select a preset category, optionally add a free-text note, confirm. Both rejection and Buyer-initiated cancellation (valid only from `PLACED`) trigger an atomic refund: a new append-only Ledger Transaction credits the Buyer's wallet, and a `reversed_by_ledger_transaction_id` self-referential link connects the refund to the original debit. When a Buyer cancels from `PLACED`, every Admin's notification is automatically edited to remove action buttons.

---

## User Stories

### Buyer — Catalog Discovery

1. As a Buyer, I want to send `/shop` and see all currently active catalog items as inline buttons so that I can browse available purchases without knowing item names in advance.
2. As a Buyer, I want to tap a catalog item and see its name, description, price, and my current Available Balance in a confirmation prompt so that I can make an informed decision before committing funds.
3. As a Buyer, I want to be shown a clear error at the confirmation stage if my Available Balance is below the item price so that I know to top up before attempting again.

### Buyer — Order Placement

4. As a Buyer, I want to tap Confirm on the order prompt so that my wallet is debited and my order is registered in a single atomic step.
5. As a Buyer, I want the price I see at confirmation to be permanently locked onto my order so that it cannot change after I confirm, even if the Admin updates the SKU price later.

### Buyer — Order Status & Cancellation

6. As a Buyer, I want to send `/myorder` to see the status, SKU name, and price of my most recent active order so that I know whether it is waiting for Admin action, being processed, or completed.
7. As a Buyer, I want a Cancel button on `/myorder` when my order is in `PLACED` status so that I can cancel and receive an immediate refund if I change my mind before an Admin claims it.
8. As a Buyer, I want to be told clearly that cancellation is no longer possible once an Admin has started processing my order so that I understand why the Cancel button is gone.

### Buyer — Notifications

9. As a Buyer, I want an instant Telegram message containing the delivery content when my order is fulfilled so that I receive my credentials or access details without delay.
10. As a Buyer, I want an instant Telegram message when my order is rejected, including the rejection category and any Admin note, so that I understand what went wrong and what to do next.
11. As a Buyer, I want an instant Telegram message confirming the refund amount and my updated Available Balance when my order is cancelled or rejected so that I know my funds have been returned.

### Admin — Catalog Management

12. As an Admin, I want to send `/catalog` and see all SKUs (active and inactive) as an inline dashboard so that I can review and manage the full catalog from one place.
13. As an Admin, I want to tap `[+ Add New]` and complete a guided conversation (name → description → price → confirm) so that new SKUs are added consistently and without errors.
14. As an Admin, I want to tap `[Edit]` on a SKU and update its name, description, or price via a guided conversation so that I can correct catalog entries without deactivating and recreating them.
15. As an Admin, I want to tap `[Deactivate]` on a SKU to immediately hide it from Buyers so that I can remove items from sale without deleting their order history.
16. As an Admin, I want to tap `[Reactivate]` on a deactivated SKU to make it visible to Buyers again so that I can restore seasonal or restocked items.

### Admin — Order Review & Claim

17. As an Admin, I want to receive an instant full-context push notification when a Buyer places an order — including SKU name, description, price, Buyer username, and the Buyer's post-debit Available Balance — so that I have everything I need to act without further lookups.
18. As an Admin, I want inline `[▶ Start Processing]` and `[✗ Reject]` buttons on the order notification so that I can act in one tap without navigating to a separate command.
19. As an Admin, I want tapping `[▶ Start Processing]` to immediately claim the order and update every Admin's copy of the notification so that the whole team can see who is handling it.
20. As an Admin, I want to send `/orders` to see all `PLACED` and `PROCESSING` orders with inline action buttons so that I have a full queue view and nothing falls through the cracks.

### Admin — Order Fulfilment

21. As a claiming Admin, I want to tap `[📦 Fulfil Order]` at any time after claiming so that I can open the delivery conversation when the credentials are actually ready, not at claim time.
22. As a claiming Admin, I want the `[📦 Fulfil Order]` button to always start a fresh delivery conversation, discarding any previous incomplete attempt, so that I never accidentally send stale or half-typed content.
23. As a claiming Admin, I want to preview the delivery content and confirm before it is sent to the Buyer so that I can catch mistakes in credentials or formatting before they reach the Buyer.
24. As an Admin who did not claim the order, I want to be prevented from entering the fulfilment conversation so that two Admins cannot simultaneously compose and send delivery content to the same Buyer.

### Admin — Order Rejection

25. As an Admin, I want to reject an order from either `PLACED` or `PROCESSING` via inline category buttons so that I do not need to enter a conversation to handle a straightforward rejection.
26. As an Admin, I want to select from four preset rejection categories so that common rejections are consistent and fast.
27. As an Admin, I want to add an optional free-text note alongside the preset category so that I can give the Buyer specific guidance when a preset alone is insufficient.
28. As an Admin, I want the system to prevent me from acting on an order that has already been cancelled, rejected, or fulfilled so that no Buyer is double-refunded and no decision is silently overwritten.

### System Integrity

29. As the system, I want the wallet debit and Order creation to execute inside a single PostgreSQL transaction protected by `SELECT … FOR UPDATE` on the wallet row so that negative balances are impossible even under concurrent order placements.
30. As the system, I want every order spend to be recorded as an immutable, append-only double-entry Ledger Transaction (DEBIT `BUYER_WALLET` + CREDIT `SYSTEM_CASH`) so that the financial audit trail is self-balancing and complete.
31. As the system, I want every refund (REJECTED or CANCELLED) to be recorded as a new append-only Ledger Transaction linked to the original debit via `reversed_by_ledger_transaction_id` so that reversals are explicit, auditable, and never modify historical rows.
32. As the system, I want the price snapshot column on the Order row to be written at placement time and never updated so that the historical cost of any order is permanently recoverable from the order row alone.
33. As the system, I want the `[▶ Start Processing]` claim to be protected by `SELECT … FOR UPDATE` on the order row so that two Admins cannot simultaneously claim the same order.
34. As the system, I want Buyer cancellation to be blocked at the service layer if `status ≠ 'PLACED'` so that an in-progress fulfilment is never disrupted.

---

## Implementation Decisions

### Modules

Eight application service modules handle RFP #2. Each is a set of async TypeScript functions that take typed inputs, interact with the database via Drizzle, and return typed outputs. grammY handlers call these functions and are responsible only for Telegram context parsing and reply formatting.

- **Catalog service**: create SKU; list all SKUs (active + inactive); list active SKUs (for Buyer /shop); edit SKU fields (name, description, usd_price); toggle is_active.
- **Order placement service**: pre-flight balance check (for confirmation prompt display); validate balance at transaction time with `SELECT … FOR UPDATE` on wallet; debit wallet; write double-entry Ledger Transaction; create Order at `PLACED`; dispatch Admin notifications (writes `order_admin_notifications` rows); return Order ID.
- **Order claim service**: `SELECT … FOR UPDATE` on order row; assert `status = 'PLACED'`; transition to `PROCESSING`; set `claimed_by_admin_telegram_id` and `claimed_at`; edit all Admin notification messages via `order_admin_notifications`; return updated Order.
- **Order fulfilment service**: assert caller is `claimed_by_admin_telegram_id`; assert `status = 'PROCESSING'`; write `delivery_content`; set `fulfilled_at`; transition to `FULFILLED`; send delivery content to Buyer; edit Admin notifications to reflect completion.
- **Order rejection service**: `SELECT … FOR UPDATE` on order row; assert `status IN ('PLACED', 'PROCESSING')`; write `rejection_category` and `rejection_note`; set `rejected_at`; transition to `REJECTED`; write refund Ledger Transaction (CREDIT `BUYER_WALLET` + DEBIT `SYSTEM_CASH`, linked via `reversed_by_ledger_transaction_id`); update wallet `available_balance`; notify Buyer; edit Admin notifications.
- **Order cancellation service** (Buyer-initiated): assert caller is order's `user_id`; assert `status = 'PLACED'`; set `cancelled_at`; transition to `CANCELLED`; write refund Ledger Transaction; update wallet `available_balance`; notify Buyer; edit all Admin notifications to remove action buttons.
- **Admin order queue service**: list all Orders with `status IN ('PLACED', 'PROCESSING')` for `/orders` command.
- **Buyer order status service**: fetch the most recent Order for the requesting Buyer regardless of status, for `/myorder`.

### Database Schema

Four additions to the schema: two new tables, one join table, and two column amendments to `ledger_transactions`.

---

**`catalog_items`**
| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `name` | `VARCHAR(255)` NOT NULL | Displayed in /shop and /catalog |
| `description` | `TEXT` nullable | Displayed in confirmation prompt |
| `usd_price` | `NUMERIC(18,2)` NOT NULL | Current list price |
| `is_active` | `BOOLEAN` NOT NULL DEFAULT `true` | Toggled independently of edit flow |
| `created_at` | `TIMESTAMPTZ` NOT NULL | |
| `updated_at` | `TIMESTAMPTZ` NOT NULL | |

No partial unique index on `name` — Admin may create similarly named SKUs for different variants.

---

**`orders`**
| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `user_id` | `UUID` FK → `users` NOT NULL | |
| `catalog_item_id` | `UUID` FK → `catalog_items` NOT NULL | |
| `usd_price_snapshot` | `NUMERIC(18,2)` NOT NULL | Price locked at placement; never updated |
| `status` | `ENUM` NOT NULL | `PLACED \| PROCESSING \| FULFILLED \| REJECTED \| CANCELLED` |
| `delivery_content` | `TEXT` nullable | Populated on `FULFILLED`; sent to Buyer |
| `rejection_category` | `VARCHAR(100)` nullable | Populated on `REJECTED` |
| `rejection_note` | `TEXT` nullable | Optional Admin free-text, populated on `REJECTED` |
| `claimed_by_admin_telegram_id` | `BIGINT` nullable | Set when transitioning to `PROCESSING` |
| `claimed_at` | `TIMESTAMPTZ` nullable | |
| `fulfilled_at` | `TIMESTAMPTZ` nullable | |
| `rejected_at` | `TIMESTAMPTZ` nullable | |
| `cancelled_at` | `TIMESTAMPTZ` nullable | |
| `created_at` | `TIMESTAMPTZ` NOT NULL | |
| `updated_at` | `TIMESTAMPTZ` NOT NULL | |

Order status enum values: `PLACED`, `PROCESSING`, `FULFILLED`, `REJECTED`, `CANCELLED`.

---

**`order_admin_notifications`**
| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `order_id` | `UUID` FK → `orders` NOT NULL | |
| `admin_telegram_id` | `BIGINT` NOT NULL | Which Admin received the push |
| `chat_id` | `BIGINT` NOT NULL | Used for `editMessageReplyMarkup` |
| `message_id` | `BIGINT` NOT NULL | Used for `editMessageReplyMarkup` |
| `created_at` | `TIMESTAMPTZ` NOT NULL | |

One row per Admin per Order. Written atomically with the Order placement. Read by the claim, rejection, cancellation, and fulfilment services to edit stale notifications.

---

**`ledger_transactions` — amended columns**
| New Column | Type | Notes |
|---|---|---|
| `order_id` | `UUID` nullable FK → `orders` | Source event for order spend and refund entries |
| `reversed_by_ledger_transaction_id` | `UUID` nullable FK → `ledger_transactions` | Self-referential; set on the *original* debit transaction when a refund is written |

`CHECK ((top_up_request_id IS NULL) != (order_id IS NULL))` — exactly one source event FK must be non-null per Ledger Transaction.

Both columns are nullable to maintain backward compatibility with existing Top-Up Ledger Transactions.

---

### Order Placement Transaction Sequence

Every order placement executes the following steps inside a single PostgreSQL transaction:

1. Read Buyer's `available_balance` (without lock) for pre-flight check at confirmation display.
2. When Buyer taps Confirm: `SELECT … FROM wallets WHERE user_id = ? FOR UPDATE` — locks the wallet row.
3. Assert `available_balance >= usd_price_snapshot`; abort with insufficient-balance error if not.
4. Insert one `orders` row at status `PLACED` with `usd_price_snapshot` copied from `catalog_items.usd_price`.
5. Insert one `ledger_transactions` row with `order_id` FK.
6. Insert two `ledger_entries` rows: `DEBIT BUYER_WALLET` and `CREDIT SYSTEM_CASH` for `usd_price_snapshot`.
7. `UPDATE wallets SET available_balance = available_balance - ?, updated_at = now()`.
8. Commit.
9. Insert `order_admin_notifications` rows and dispatch push notifications to all Admins (outside transaction, fire-and-forget).

### Order Claim Transaction Sequence

1. `SELECT … FROM orders WHERE id = ? FOR UPDATE` — locks the order row.
2. Assert `status = 'PLACED'`; return "already claimed or closed" error if not.
3. `UPDATE orders SET status = 'PROCESSING', claimed_by_admin_telegram_id = ?, claimed_at = now(), updated_at = now()`.
4. Commit.
5. Read `order_admin_notifications` for this order and call `editMessageReplyMarkup` on each Admin's message (outside transaction, fire-and-forget).

### Refund Transaction Sequence (Rejection or Cancellation)

1. `SELECT … FROM orders WHERE id = ? FOR UPDATE` — locks the order row.
2. Assert status is valid for the caller (rejection: `PLACED` or `PROCESSING`; cancellation: `PLACED`).
3. `SELECT … FROM wallets WHERE user_id = ? FOR UPDATE` — locks the wallet row.
4. Insert one `ledger_transactions` row (the refund) with `order_id` FK.
5. Insert two `ledger_entries` rows: `CREDIT BUYER_WALLET` and `DEBIT SYSTEM_CASH`.
6. `UPDATE ledger_transactions SET reversed_by_ledger_transaction_id = <refund_id> WHERE id = <original_debit_id>`.
7. `UPDATE wallets SET available_balance = available_balance + ?, updated_at = now()`.
8. `UPDATE orders SET status = ?, [rejection_category, rejection_note, rejected_at | cancelled_at], updated_at = now()`.
9. Commit.
10. Notify Buyer and edit Admin notifications (outside transaction, fire-and-forget).

### Fulfilment Conversation Flow

Triggered by the claiming Admin tapping `[📦 Fulfil Order]`. Resets any previous dangling grammY conversation state before starting.

1. **Step 1 — Input**: Bot sends: "📦 *Deliver Order #XYZ*\n\nPlease type the delivery content to send to @buyer." Admin types the credentials/content.
2. **Step 2 — Preview & Confirm**: Bot echoes the typed content in a formatted message and sends: "Send this to @buyer? [✓ Send] [✗ Re-enter]". Tapping Re-enter loops to step 1.
3. **Step 3 — Commit**: On Confirm, the fulfilment service runs: asserts caller = `claimed_by_admin_telegram_id`, asserts `status = 'PROCESSING'`, writes `delivery_content`, sets `fulfilled_at`, transitions to `FULFILLED`, commits, then forwards the content to the Buyer and edits Admin notifications.

### Rejection Inline Keyboard Flow

Triggered by tapping `[✗ Reject]` from either the order notification (PLACED) or the `/orders` queue (PLACED or PROCESSING).

1. Bot edits or replies with a message showing 5 preset category buttons:
   - `Out of stock / temporarily unavailable`
   - `Cannot verify order legitimacy`
   - `Technical issue — unable to fulfil`
   - `Policy violation`
   - `Other (enter text)`
2. Admin taps a category. Bot replies: "Add a note? Type one now, or tap [Skip]." (If "Other" is selected, a note is required.)
3. Admin types a note or taps Skip.
4. Rejection service runs inside a transaction (sequence above). Buyer notified; Admin notifications edited.

### Preset Rejection Categories

| Display Label | Stored Value |
|---|---|
| Out of stock / temporarily unavailable | `OUT_OF_STOCK` |
| Cannot verify order legitimacy | `CANNOT_VERIFY` |
| Technical issue — unable to fulfil | `TECHNICAL_ISSUE` |
| Policy violation | `POLICY_VIOLATION` |
| Other | `OTHER` |

When `OTHER` is selected, `rejection_note` is mandatory.

### Money Arithmetic

Identical to RFP #1 (ADR-0004): all USD arithmetic uses `decimal.js`. Drizzle returns `NUMERIC(18,2)` as strings; these are wrapped in `new Decimal(str)` at the DB boundary and written back via `.toFixed(2)`. Native `number` is never used for USD arithmetic.

### Admin Command Surface (RFP #2)

| Command / Action | Description |
|---|---|
| `/catalog` | Opens the interactive SKU catalog dashboard |
| `/orders` | Lists all `PLACED` and `PROCESSING` orders with inline action buttons |
| `[▶ Start Processing]` on notification | Claims the order; transitions to `PROCESSING`; edits all Admin notifications |
| `[📦 Fulfil Order]` on claimed notification | Opens the 3-step fulfilment conversation (claiming Admin only) |
| `[✗ Reject]` on notification or `/orders` entry | Opens the rejection inline keyboard flow |

### Buyer Command Surface (RFP #2)

| Command | Description |
|---|---|
| `/shop` | Displays active catalog items as an inline keyboard |
| `/myorder` | Shows most recent Order status and a Cancel button if `PLACED` |

---

## Testing Decisions

### What Makes a Good Test

Identical philosophy to RFP #1: tests cover observable external behaviour only — the state of the database after a service call, the return value, and the errors raised. No assertions on internal Drizzle method calls or query counts. Each test reads like a business scenario.

### Seam

All tests call application service functions directly against a real PostgreSQL test database. The grammY bot layer, Telegram API, and notification dispatch (including `order_admin_notifications` edits) are not involved in any test. Clean database state between tests (truncate or transaction rollback isolation).

### Modules Covered

| Module | Key scenarios tested |
|---|---|
| Catalog service | Create SKU; list active SKUs only in Buyer view; edit name/description/price; deactivate hides from Buyer view; reactivate restores; inactive SKUs remain in Admin catalog view |
| Order placement service | Happy path: wallet debited, ledger rows written, order at `PLACED`; insufficient balance rejected pre-flight and at transaction level; snapshot price matches SKU price at placement time; concurrent placements do not produce negative balance |
| Order claim service | Happy path: status → `PROCESSING`, claimed fields set; second Admin claim on same order returns "already claimed" error; claim on non-`PLACED` order rejected |
| Order fulfilment service | Happy path: delivery_content written, status → `FULFILLED`; non-claiming Admin attempt rejected; fulfilment on non-`PROCESSING` order rejected |
| Order rejection service | Happy path from `PLACED`: refund ledger written, balance restored, status → `REJECTED`; happy path from `PROCESSING`: same; second rejection on already-terminal order rejected; `reversed_by_ledger_transaction_id` correctly links refund to original debit |
| Order cancellation service | Happy path from `PLACED`: refund written, balance restored, status → `CANCELLED`; cancel from `PROCESSING` rejected; non-owner Buyer cancel rejected |
| Admin order queue service | Returns only `PLACED` and `PROCESSING` orders; terminal orders excluded |
| Buyer order status service | Returns most recent order regardless of status |

---

## Out of Scope

- **Order history for Buyers**: `/myorder` shows the most recent active order only; full history is a later RFP.
- **Inventory / stock tracking**: SKU availability is controlled by `is_active` only; no stock counter or auto-deactivation.
- **Multi-unit orders**: one Order = one unit of one SKU; quantity and cart features are deferred.
- **File or media delivery**: `delivery_content` is plain text only; file-based credential delivery is a later RFP.
- **SKU categories or tags**: flat catalog, no hierarchy or filtering.
- **Buyer order ratings or reviews**.
- **Admin analytics on orders** (revenue reports, fulfilment time, rejection rate).
- **Automatic or webhook-based fulfilment**.
- **Order re-assignment** from one claiming Admin to another.
- **Unified `/pending` queue** mixing Top-Up and Order items.
- **Manual balance adjustments or Admin-initiated refunds** outside the REJECTED/CANCELLED paths.
- **Per-Buyer order limits or spending caps**.
- **Object storage for delivery content**: plain text in a `TEXT` column is always retrievable.

---

## Further Notes

- **ADR-0006** documents the XOR CHECK constraint and self-referential `reversed_by_ledger_transaction_id` FK on `ledger_transactions`.
- **ADR-0007** documents the rationale for the explicit `PROCESSING` intermediate state and the decoupled claim/delivery flow.
- **ADR-0008** documents the `order_admin_notifications` join table pattern for editable push notifications.
- The `usd_price_snapshot` column is the ordering counterpart of `irr_amount` on `top_up_requests` — both permanently lock the financial terms agreed at initiation time.
- `SYSTEM_CASH` serves as the contra account for both incoming funds (Top-Up credits) and outgoing spend (Order debits and their refunds). Its dual role does not require a new account type in MVP.
- The `[📦 Fulfil Order]` button is only actionable for the claiming Admin; other Admins see `[🔒 Processing by @adminX]` as non-interactive text.
- Drizzle migrations for this RFP must be committed to the repository and executed as part of every deployment.
