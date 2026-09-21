# Feature: Polymorphic Service Catalog, Dynamic Buyer Inputs & Multi-Strategy Fulfillment

Status: ready-for-agent

## Problem Statement

The bot's service catalog currently assumes all purchasable items operate under a single uniform model: instantaneous order confirmation without buyer inputs, and manual fulfillment requiring an Admin to type plain-text delivery credentials (`Delivery Content`).

This model breaks down when expanding the catalog to modern digital services:

1. **Direct Account Upgrades** (e.g. ChatGPT Plus, Spotify Family): Require sensitive buyer inputs (email, password) prior to placement, and fulfillment is activation-based (admin upgrades the account externally; no outbound credentials delivered to buyer). Storing buyer passwords in plaintext is an extreme security liability.
2. **Identity & Handle-based Services** (e.g. Telegram Premium Gift): Require user handles (target `@username` or Telegram ID) to direct the transfer/gift.
3. **Configuration-based Services** (e.g. VPN): Require technical parameters (server location, protocol) during purchase. In MVP, fulfillment involves manual config delivery; post-MVP requires background automation via provider panel APIs (e.g. Marzban, Sanaei) without breaking existing orders.

Admins also lack streamlined fulfillment workflows: they are currently forced to type arbitrary text even for account upgrades where no delivery content exists, and they receive no standard rejection category when buyer credentials are invalid.

## Solution

Introduce a **Polymorphic Service Catalog** with decoupled **Buyer Requirements** and **Fulfillment Strategies**, backed by an interactive pre-placement conversation flow, at-rest credential encryption with terminal-state redaction, and claim-gated admin notification reveals.

1. **Pre-Placement Requirement Flow**: When a Buyer chooses a Catalog Item that requires inputs, an interactive grammY conversation (`collect_order_requirements`) guides the Buyer step-by-step. The wallet debit, ledger transaction, and `Order` creation at `PLACED` remain strictly atomic at final confirmation. A fail-fast balance check prevents underfunded Buyers from entering the conversation.
2. **Decoupled Catalog Type & Fulfillment Strategy**: `catalog_items` separates inbound requirement taxonomy (`STATIC_DELIVERY`, `DIRECT_ACCOUNT`, `IDENTITY_HANDLE`, `CONFIG_VPN`) from outbound execution (`PAYLOAD_DELIVERY`, `ACTIVATION`, `AUTOMATED_PANEL`). `orders` captures an immutable `fulfillment_strategy_snapshot` alongside `usd_price_snapshot` at placement time. Distinct VPN tiers are distinct Catalog Items with 1:1 pricing.
3. **At-Rest AES-256-GCM Encryption & Selective Redaction**: Account passwords in `orders.buyer_inputs` are encrypted using `CREDENTIALS_ENCRYPTION_KEY`. Raw password messages in Telegram chat are deleted immediately after receipt. When an Order enters a terminal state (`FULFILLED`, `REJECTED`, `CANCELLED`), password fields are selectively overwritten with `[REDACTED]`, preserving emails and handles for audit provenance.
4. **Claim-Gated Admin Push Notifications**: Broadcast notifications to Admins mask sensitive passwords (`🔒 Claim order to reveal`). Only upon an Admin claiming the order (`PLACED → PROCESSING`) is the password decrypted and exposed exclusively to that claiming Admin.
5. **Strategy-Driven Fulfillment & Rejection**:
   - `ACTIVATION`: One-click confirmation prompt without text entry; dispatches an activation notice to the Buyer.
   - `PAYLOAD_DELIVERY`: Retains the 3-step conversation to capture `Delivery Content`.
   - `AUTOMATED_PANEL`: Architectural seam for background workers with manual fallback.
   - Adds `INVALID_CREDENTIALS` to `ORDER_REJECTION_CATEGORIES` for handling login failures and 2FA blocks with automatic refunds.
6. **Type-Aware Account Hub Order Views**: Renders order details dynamically based on strategy (activation banner vs payload block) and displays submitted buyer metadata while suppressing passwords.

## User Stories

1. As a Buyer, I want to browse the `/shop` and see which services require account credentials, usernames, or technical options before I purchase.
2. As a Buyer with insufficient Available Balance, I want the bot to reject my purchase attempt immediately when I select an item, so that I do not waste time typing my credentials before discovering I cannot afford it.
3. As a Buyer purchasing a Direct Account service (e.g. Spotify, ChatGPT), I want the bot to guide me through an interactive prompt to submit my email and password safely.
4. As a Buyer submitting my account password to the bot, I want my password message to be deleted from the Telegram chat immediately, so that no sensitive credentials remain in my chat history.
5. As a Buyer purchasing a handle-based service (e.g. Telegram Premium Gift), I want the bot to prompt me for the recipient `@username` or Telegram ID, validating its format before proceeding.
6. As a Buyer purchasing a VPN service, I want to select my preferred server region from inline buttons during order setup.
7. As a Buyer, I want to see a final confirmation summary containing my selected item, price, available balance, and submitted inputs with my password masked before confirming the order.
8. As a Buyer, I want to be able to cancel an in-progress requirement collection flow at any step, ensuring my wallet balance is not debited and no order is placed.
9. As a Buyer, I want my wallet balance to be debited atomically only when I press `[✓ Confirm]` on the final order summary, so that I never lose money on abandoned orders.
10. As a Buyer whose order was fulfilled via `ACTIVATION`, I want to receive an activation confirmation message explaining that my account has been upgraded, without confusing empty payload sections.
11. As a Buyer whose order was fulfilled via `PAYLOAD_DELIVERY`, I want to receive my delivery credentials or configuration link exactly as before.
12. As a Buyer whose order was rejected due to invalid credentials, I want to receive a notification explaining that my login details failed or were 2FA-blocked, with my USD balance automatically refunded to my wallet.
13. As a Buyer inspecting an order in the Account Hub (`/account`), I want to see my submitted email or username alongside the order status, while my password is permanently hidden.
14. As an Admin creating a new Catalog Item in `/admin`, I want to select the `CatalogType` (`DIRECT_ACCOUNT`, `IDENTITY_HANDLE`, `CONFIG_VPN`, `STATIC_DELIVERY`) from an inline keyboard.
15. As an Admin creating a new Catalog Item, I want the system to automatically pre-select the appropriate default `FulfillmentStrategy` based on the chosen type, while giving me the option to customize it.
16. As an Admin receiving an order notification for a `DIRECT_ACCOUNT` order, I want the broadcast notification to mask the buyer's password, so that sensitive credentials are not leaked across all admin inboxes or shared notification chats.
17. As an Admin claiming an order (`[▶ Start Processing]`), I want the decrypted account credentials to be revealed exclusively in my private notification view once I have claimed it.
18. As an Admin fulfilling an `ACTIVATION` order, I want to see a one-click confirmation prompt (`[✓ Yes, Mark Fulfilled]`) without being forced to type dummy text into a conversation.
19. As an Admin fulfilling a `PAYLOAD_DELIVERY` order, I want to enter the 3-step grammY conversation to provide `Delivery Content` as before.
20. As an Admin processing an order with bad credentials, I want to select `INVALID_CREDENTIALS` from the rejection menu, triggering an automatic wallet refund to the Buyer with appropriate explanatory copy.
21. As an Operator, I want account passwords stored in `orders.buyer_inputs` to be encrypted with AES-256-GCM at rest, so that database dumps or unauthorized read-replica access cannot expose active buyer passwords.
22. As an Operator, I want passwords in `orders.buyer_inputs` to be selectively overwritten with `[REDACTED]` as soon as the order reaches a terminal state (`FULFILLED`, `REJECTED`, `CANCELLED`), minimizing the retention window of sensitive data while preserving non-sensitive audit metadata.
23. As a Developer, I want `fulfillment_strategy_snapshot` stored on `orders` at placement time, so that updating a Catalog Item's fulfillment strategy in the future never corrupts or alters in-flight orders.

## Implementation Decisions

### Domain Glossary & Invariants

- Incorporates `Buyer Requirement`, `Buyer Input`, and `Fulfillment Strategy` into the domain model per ADR-0011, preserving `Buyer`, `Catalog Item`, `Order`, `Price Snapshot`, and `Delivery Content`.
- Placement remains strictly atomic: wallet row lock `FOR UPDATE`, available balance verification, double-entry ledger entries, and `Order` creation at `PLACED` all occur in a single database transaction.

### Schema Modifications (Drizzle ORM & PostgreSQL)

- **`catalog_type` Enum**: `['STATIC_DELIVERY', 'DIRECT_ACCOUNT', 'IDENTITY_HANDLE', 'CONFIG_VPN']`.
- **`fulfillment_strategy` Enum**: `['PAYLOAD_DELIVERY', 'ACTIVATION', 'AUTOMATED_PANEL']`.
- **`catalog_items` Table Additions**:
  - `catalog_type`: `catalog_type_enum` not null default `'STATIC_DELIVERY'`.
  - `fulfillment_strategy`: `fulfillment_strategy_enum` not null default `'PAYLOAD_DELIVERY'`.
  - `requirement_config`: `jsonb` nullable (used for presets, e.g. allowed VPN regions: `{"allowedRegions": ["de", "nl", "fi"]}`).
- **`orders` Table Additions**:
  - `fulfillment_strategy_snapshot`: `fulfillment_strategy_enum` not null default `'PAYLOAD_DELIVERY'`.
  - `buyer_inputs`: `jsonb` nullable (structured JSON holding submitted inputs and encrypted credential ciphertext/iv/tag).

### Cryptographic Service (`CredentialCryptoService`)

- A dedicated service responsible for AES-256-GCM encryption and decryption of sensitive string values.
- Reads a 32-byte key from `CREDENTIALS_ENCRYPTION_KEY` environment variable. Throws on startup or invocation if the key is invalid or missing.
- Returns a structured cipher object `{ ciphertext: string, iv: string, tag: string }`.
- Decryption occurs strictly in-memory during authorized Admin inspection or claim-reveal routines; decrypted text is never logged.

### Buyer Requirement Strategies (`IBuyerRequirementStrategy`)

- Implements a strategy pattern for collecting, validating, and sanitizing buyer inputs:
  - `DirectAccountRequirementStrategy`: Prompts for email (regex validation) and password. Deletes the raw Telegram password message using `ctx.deleteMessage()`. Encrypts password via `CredentialCryptoService`.
  - `IdentityHandleRequirementStrategy`: Prompts for target `@username` (regex) or Telegram numeric ID.
  - `ConfigVpnRequirementStrategy`: Renders inline keyboard of regions configured on the item's `requirement_config`.
  - `StaticDeliveryRequirementStrategy`: No-op; returns empty inputs immediately.

### Buyer Requirement Conversation (`collect_order_requirements`)

- Registered in grammY conversations router.
- Triggered when a Buyer selects a non-`STATIC_DELIVERY` Catalog Item from `/shop` (after passing the pre-conversation balance check).
- Step-by-step interactive prompts respecting `isCancelCommand` and `flow:cancel` inline callbacks.
- Final step displays a structured Order Confirmation Prompt summarizing: item name, price, available balance, remaining balance, and non-sensitive inputs (with password masked as `••••••••`).
- On confirmation, calls `orderService.placeOrder({ ...buyerInputs })`.

### Admin Notification & Claim-Gated Reveal (ADR-0013)

- Initial broadcast push messages sent to all Admins via `orderAdminNotifications` display sanitized inputs:
  - For `DIRECT_ACCOUNT`: `📧 ایمیل: buyer@example.com`, `🔑 رمز عبور: 🔒 پس از شروع پردازش نمایش داده می‌شود`.
- When an Admin claims the order (`order:process:<orderId>`):
  - The notification message for that specific claiming Admin is updated to reveal the decrypted credentials.
  - Other Admins' copies update to `🔒 در حال پردازش توسط @adminX` with the password remaining masked.

### Admin Strategy-Driven Fulfillment (ADR-0011)

- In `fulfil.handler.ts` / `fulfil.conversation.ts`:
  - When `fulfillment_strategy_snapshot === 'ACTIVATION'`: Tapping `[📦 تحویل سفارش]` renders a direct confirmation prompt (`"آیا فعال‌سازی حساب برای ایمیل X انجام شده است؟ [✓ تایید فعال‌سازی] [❌ انصراف]"`). Fulfilling marks status `FULFILLED` without prompting for delivery text, and notifier dispatches a tailored activation message to the Buyer.
  - When `fulfillment_strategy_snapshot === 'PAYLOAD_DELIVERY'`: Launches the existing 3-step conversation prompting for `Delivery Content`.
  - When `fulfillment_strategy_snapshot === 'AUTOMATED_PANEL'`: Handled by background panel job (with manual admin override).

### Terminal State Redaction (ADR-0012)

- In `orderService.fulfilOrder()`, `rejectOrder()`, and `cancelOrder()`:
  - If `order.buyerInputs` contains encrypted credential fields, the sensitive fields are mutated to `"[REDACTED]"` in the update payload.
  - Non-sensitive metadata (`email`, `targetUsername`, `region`) remains intact.

### Order Rejection Updates

- Adds `INVALID_CREDENTIALS` code to `ORDER_REJECTION_CATEGORIES` in `order.keyboards.ts`:
  - Label: `"اطلاعات ورود نامعتبر / نیاز به تایید دو مرحله‌ای"`
  - English: `"Invalid Credentials / 2FA Blocked"`
- When selected, triggers automatic wallet refund and notifies the Buyer with specific guidance to check credentials or disable 2FA.

### Admin Catalog Conversation Updates

- `add_catalog_item` conversation updated to:
  1. Prompt `Name`
  2. Prompt `Description` (optional, skip-enabled)
  3. Inline keyboard to pick `CatalogType`
  4. Auto-suggest matching `FulfillmentStrategy` (with optional toggle to override)
  5. If `CONFIG_VPN`, choose region presets
  6. Prompt `USD Price`
  7. Final confirmation and persistence

## Testing Decisions

### What makes a good test

Tests must verify observable external behavior and state transitions against a real database, not internal implementation mechanics. Tests should verify that Telegram messages sent, keyboards rendered, and database rows written (including ledger entries, wallet balances, and encrypted payloads) adhere strictly to our business rules.

### Seams to Test

1. **End-to-End Bot Seam (Primary)**:
   - Uses `createBot({ dbClient, client: { fetch: mockFetch } })` with `setupTestDatabase()`.
   - Tests updates dispatched via `bot.handleUpdate(update)` simulating Buyer and Admin interactions.
   - Verifies:
     - Pre-conversation balance gate rejects underfunded buyers with no prompt conversation started.
     - Buyer interactive requirement conversation for `DIRECT_ACCOUNT`, `IDENTITY_HANDLE`, and `CONFIG_VPN`.
     - Raw password message deletion from Telegram mock fetch calls.
     - Broadcast admin notifications show masked passwords; claiming admin sees decrypted password.
     - Activation fulfillment confirms and notifies buyer without requiring delivery content text.
     - Rejection with `INVALID_CREDENTIALS` refunds wallet balance and updates order state.
2. **Domain Service & Crypto Seam (Secondary)**:
   - Direct unit/integration tests for `CredentialCryptoService` verifying AES-256-GCM encryption/decryption round-trips and tampering detection.
   - `OrderService` integration tests verifying atomic placement with `buyerInputs`, selective redaction of passwords upon `fulfilOrder` and `rejectOrder`, and retention of audit metadata.

### Prior Art

- `tests/bot/buyer/shop.test.ts` (buyer shop flow, order placement, and wallet balance verification).
- `tests/bot/admin/fulfil.test.ts` (admin claim and fulfilment conversation tests).
- `tests/bot/admin/reject-order.test.ts` (admin rejection categories and ledger refund verification).
- `tests/modules/order/order.service.test.ts` (transaction isolation and order repository tests).

## Out of Scope

- Direct external API communication with VPN provider panels (Marzban, Sanaei); post-MVP automated panel integration will hook into the `AUTOMATED_PANEL` strategy seam established here.
- Dynamic custom form-builder UI for Admins to create arbitrary regex validation rules over Telegram chat; requirements are bounded by the canonical `CatalogType` taxonomy.
- Dynamic matrix/variant pricing within a single Catalog Item; different plan durations/bandwidth tiers are configured as separate Catalog Items.

## Further Notes

- Ensure `CREDENTIALS_ENCRYPTION_KEY` is documented in `.env.example`.
- All Persian user-facing messages must remain consistent with the established tone in `shop.handler.ts` and `order.notifier.ts`.
