# Feature: Buyer Account Hub

Status: ready-for-agent

## Problem Statement

Buyers currently have no centralized place to see who they are in the system, understand their balance history, or review more than their most recent order. Account data is fragmented across multiple commands (`/balance`, `/myorder`, `/status`) and the main menu exposes a single "last order" shortcut that cannot grow into a real order history without replacing the entire main menu. The bot's top-level navigation has no room to add richer buyer-facing features without clutter.

## Solution

Introduce an **Account Hub** — a centralized buyer view accessible via a new `👤 حساب کاربری` main-menu button and a `/account` command. The hub opens with a **Profile Card**: a single Telegram message that aggregates the Buyer's identity data, Available Balance, an order-status breakdown, and a contextual Top-Up Request alert. From the Profile Card, inline buttons drill into an Order History view (last 5 orders, with per-order detail and cancel actions) and a Transaction History view (last 5 wallet ledger events). The main menu is reorganized from 3 to 3 buttons — the standalone `📦 آخرین سفارش` button is removed and replaced by `👤 حساب کاربری`. The Wallet sub-menu is left entirely intact. `/myorder` is redirected to the new 5-order history view for backward compatibility.

## User Stories

1. As a Buyer, I want to tap `👤 حساب کاربری` from the main menu so that I can see all my account data in one place.
2. As a Buyer, I want to type `/account` so that I can reach the Account Hub directly from the command menu without navigating the keyboard.
3. As a Buyer, I want the Profile Card to show my Telegram ID so that I can confirm which account I am logged in as.
4. As a Buyer, I want the Profile Card to show my Telegram username so that I can verify my identity at a glance.
5. As a Buyer, I want the Profile Card to show my registration date so that I know how long I have been a member.
6. As a Buyer, I want the Profile Card to show my current Available Balance so that I do not need to navigate to the Wallet sub-menu just to check my balance.
7. As a Buyer, I want the Profile Card to show an order-status breakdown (Fulfilled / In Progress / Cancelled) so that I can understand my order history at a glance without drilling in.
8. As a Buyer with an active `INITIATED` Top-Up Request, I want to see a banner on the Profile Card prompting me to submit my receipt so that I do not forget to complete my pending top-up.
9. As a Buyer with an active `PENDING` Top-Up Request, I want to see a banner on the Profile Card telling me it is awaiting Admin approval so that I know I do not need to take any action.
10. As a Buyer with a `PENDING` Top-Up Request, I want the alert banner to include an inline cancel button so that I can cancel the request directly from the Account Hub without navigating to the Wallet sub-menu.
11. As a Buyer, I want to tap `[📦 تاریخچه سفارش‌ها]` on the Profile Card so that I can see a list of my recent orders.
12. As a Buyer, I want the Order History to show up to 5 of my most recent orders so that I have a meaningful recent history without being overwhelmed.
13. As a Buyer, I want each order in the history list to be displayed as a tappable inline button showing the order status and service name so that I can identify the order I want to inspect.
14. As a Buyer, I want to tap an order in the list so that the message updates to show that order's full detail (service name, price, status, date, and any rejection or delivery notes).
15. As a Buyer viewing an order detail, I want to see a `[🔙 بازگشت به لیست]` button so that I can return to the order list without reissuing the hub command.
16. As a Buyer viewing a `PLACED` order in the detail view, I want to see a `[❌ لغو سفارش]` button so that I can cancel the order directly from the Account Hub.
17. As a Buyer, I want orders in `PROCESSING`, `FULFILLED`, `REJECTED`, or `CANCELLED` states to be shown as read-only in the detail view (no cancel button) so that I am not offered actions that are not permitted.
18. As a Buyer, I want the Order History to show an empty-state message if I have placed no orders so that I receive clear feedback rather than a broken or empty list.
19. As a Buyer, I want to tap `[💳 تاریخچه تراکنش‌ها]` on the Profile Card so that I can see a summary of recent wallet events.
20. As a Buyer, I want the Transaction History to show up to 5 of my most recent wallet ledger events so that I can understand recent balance changes.
21. As a Buyer, I want each transaction entry to show a credit/debit indicator, the ledger narrative, the USD amount, and the date so that I can understand what happened and when.
22. As a Buyer, I want the Transaction History to show an empty-state message if I have no ledger history so that I receive clear feedback.
23. As a Buyer, I want `/myorder` to now show my last 5 orders (the same view as the Account Hub's Order History) so that my saved command shortcut continues to work and gives me richer information.
24. As a Buyer, I want the main menu to still have exactly 3 buttons after this change so that the keyboard layout is not disrupted.
25. As a Buyer, I want the existing `💳 مدیریت کیف پول` Wallet sub-menu to remain fully intact so that my existing workflows for topping up, checking balance, and cancelling requests are unchanged.

## Implementation Decisions

### Main Menu Keyboard Reorganization
- The `getBuyerMainMenuKeyboard` function is updated to replace `📦 آخرین سفارش` with `👤 حساب کاربری`. The button count stays at 3.
- The wallet button label changes from `💰 مدیریت کیف پول` to `💳 مدیریت کیف پول` (icon update only; all existing hears patterns remain).

### New `/account` Bot Command
- `/account` is added to `BUYER_BOT_COMMANDS` with a description matching its purpose.
- The `BuyerComposer` gains a `composer.command("account", ...)` handler and a `composer.hears(["👤 حساب کاربری", ...], ...)` handler, both routing to the Profile Card handler.

### `/myorder` Redirect
- The `/myorder` command and its associated `hears` patterns are redirected to the new Order History view (last 5 orders) instead of `handleMyOrderCommand`'s current single-order behavior.
- `/myorder` remains in `BUYER_BOT_COMMANDS`.

### Profile Card Handler
- A new handler function renders the Profile Card message. It fetches: Buyer record (Telegram ID, username, `createdAt`), Available Balance from the Wallet, and an order-status breakdown.
- The order-status breakdown groups statuses into three buckets: ✅ `FULFILLED`, ⏳ `PLACED` + `PROCESSING`, ❌ `CANCELLED` + `REJECTED`.
- If an active Top-Up Request exists (`INITIATED` or `PENDING`), an alert section is appended to the message with state-specific copy:
  - `INITIATED`: instructs the Buyer to submit their receipt.
  - `PENDING`: informs the Buyer the request is awaiting Admin approval and provides an inline `[❌ لغو درخواست]` button.
- Two inline buttons are always present on the Profile Card: `[📦 تاریخچه سفارش‌ها]` and `[💳 تاریخچه تراکنش‌ها]`.

### Order History View
- A new callback query handler (e.g. `account:orders`) renders the order history by editing the Profile Card message.
- It fetches the last 5 Orders for the Buyer, joined with their Catalog Item name.
- Each order renders as an inline button: `[<status emoji> <service name> — <date>]` with callback data `account:order:<orderId>`.
- An order detail callback handler (`account:order:<orderId>`) edits the message to the full order detail view (same content as the existing single-order view). If the order is `PLACED`, a `[❌ لغو سفارش]` button is shown. A `[🔙 بازگشت به لیست]` button (`account:orders`) is always shown.
- The existing `order:cancel:<orderId>` callback is reused for cancellations triggered from the detail view.
- Empty state: if no orders exist, the message states so with a prompt to visit the shop.

### Transaction History View
- A new callback query handler (`account:transactions`) renders transaction history by editing the Profile Card message.
- It fetches the last 5 `BUYER_WALLET` Ledger Entries for the Buyer's Wallet, joined with the parent `ledger_transaction` to access the `narrative` field.
- Each entry renders as: `➕/➖ <narrative>: +/-$<amount> | <date>` (CREDIT = `➕`, DEBIT = `➖`).
- A `[🔙 بازگشت به پروفایل]` button re-renders the Profile Card.
- Empty state: if no ledger history exists, the message states so.

### New Service Methods
Three new read-only query methods are required — no schema changes are needed:
- **On OrderService** (or a dedicated query service): `getRecentOrdersForBuyer(telegramChatId, limit)` — returns the last N orders for the Buyer, each with the associated Catalog Item name.
- **On OrderService**: `getOrderCountBreakdown(telegramChatId)` — returns a count of orders grouped into the three display buckets (fulfilled, in-progress, cancelled).
- **On WalletService or LedgerService**: `getRecentWalletTransactions(walletId, limit)` — returns the last N `BUYER_WALLET` Ledger Entries for a given wallet, joined with their parent Ledger Transaction's `narrative`.

### Callback Query Namespace
All new Account Hub callbacks use the `account:` prefix to avoid collisions with existing `shop:`, `order:`, and `topup:` namespaces.

### No Schema Changes
All data required by the Account Hub (Buyer fields, Wallet balance, Ledger Entries + narrative, Order + Catalog Item join) exists in the current schema. No migrations are needed.

## Testing Decisions

### What makes a good test
Test observable bot behavior — the Telegram messages sent and inline keyboards returned — not internal handler implementation details. Service-layer tests verify query correctness against a real test DB; bot-layer tests verify the full round-trip through `createBot()` and a mock Telegram fetch.

### Seam 1 — Bot integration (primary, new): `tests/bot/buyer/account.test.ts`
- Pattern: mirrors `tests/bot/buyer/myorder.test.ts` — uses `setupTestDatabase()`, `createBot()`, `createMockFetch()`, and fixture helpers (`createTestBuyer`, `placeTestOrder`, etc.).
- Covers:
  - `/account` command and `👤 حساب کاربری` hears both render the Profile Card.
  - Profile Card contains Telegram ID, username, registration date, Available Balance, and order-status breakdown.
  - INITIATED Top-Up alert renders correct copy and no cancel button.
  - PENDING Top-Up alert renders correct copy and inline cancel button; tapping the cancel button cancels the request.
  - Order History drill-in: list renders up to 5 orders; orders beyond 5 are not shown; empty state when no orders exist.
  - Order detail drill-in: correct content for each status; `[❌ لغو سفارش]` appears only on `PLACED` orders; `[🔙 بازگشت به لیست]` always present.
  - Cancel-from-detail: reuses `order:cancel:<orderId>` callback; balance refund message shown on success.
  - Transaction History drill-in: entries render with correct `➕/➖` indicator, narrative, amount, date; empty state when no ledger history.
  - `[🔙 بازگشت]` buttons correctly re-render the parent view.

### Seam 2 — Bot integration (update): `tests/bot/buyer/myorder.test.ts`
- Update existing tests so that `/myorder` is expected to render the 5-order history list rather than a single last-order message.
- Existing cancel-callback tests remain valid (the callback data format is unchanged).

### Seam 3 — Module/service (optional): `tests/modules/order/order-hub-queries.service.test.ts`
- Add only if `getRecentOrdersForBuyer` or `getOrderCountBreakdown` contain non-trivial grouping or join logic that is not adequately exercised by the integration tests.
- Pattern: mirrors `tests/modules/order/order-queue.service.test.ts`.

## Out of Scope

- Paginated order history beyond 5 entries.
- Paginated transaction history beyond 5 entries.
- Editable Buyer profile fields (display name, contact preferences, etc.).
- Ledger history for INITIATED or PENDING top-up requests (only settled ledger entries are shown).
- Admin-facing account inspection of individual Buyers.
- Any changes to the Admin main menu or Admin-side flows.
- Changes to the Wallet sub-menu or any existing top-up, cancel, or status flows.

## Further Notes

- The `Buyer.getDisplayName()` method (returns `@username` or `ID: <telegramChatId>`) is available for rendering the username/ID line on the Profile Card.
- The Profile Card's Top-Up alert and the Wallet sub-menu's `📋 پیگیری وضعیت` / `❌ لغو درخواست` paths remain independent. Both can co-exist; the Account Hub does not intercept or replace the Wallet sub-menu callbacks.
- ADR 0010 (`docs/adr/0010-account-hub-buyer-profile-card.md`) records the decision to keep the Wallet sub-menu intact and documents the two rejected design alternatives.
- All new domain terms are captured in `CONTEXT.md` under the `### Account Hub` section: **Account Hub** and **Profile Card**.
