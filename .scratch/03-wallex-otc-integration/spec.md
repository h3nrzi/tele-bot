Status: ready-for-agent

# Wallex OTC Integration & Dynamic Exchange Rate Engine (RFP #3)

## Problem Statement

The system currently relies on Admins to manually configure the USD→IRR Exchange Rate via Telegram commands. This introduces operational overhead, stale pricing during off-hours, and exposes the platform to exchange-rate drift between the rate shown to Buyers and the actual cost of acquiring USDT on the open market. Additionally, after an Admin approves a fiat Top-Up Request, the deposited IRR sits idle in a bank account with no automated mechanism to convert it into USDT for the treasury — requiring Admins to manually execute trades on Wallex.

## Solution

Introduce a dual-mode Exchange Rate engine and an automated post-approval OTC Purchase pipeline:

1. **Rate Mode Toggle** — Admins can switch between Manual mode (existing behavior) and Auto-Sync mode, where buyer-facing exchange rates are sourced from the Wallex OTC pricing engine with an Admin-configurable Spread applied.

2. **Hybrid Rate Architecture** — In Auto-Sync mode, Top-Up initiation fetches a fresh, on-demand OTC Quote from Wallex and locks it inline on the Top-Up Request. A periodic background job syncs a Baseline Rate every 60 minutes as a fallback if the on-demand fetch fails.

3. **Post-Approval OTC Purchase** — After an Admin approves a Top-Up Request and the Buyer's Wallet is credited, the system asynchronously triggers a Wallex OTC market buy of USDT for the equivalent USD amount. Results (success or failure) are recorded in a `wallex_otc_purchases` audit table and reported to a dedicated ops Telegram group (or Admin DMs as fallback).

## User Stories

1. As an Admin, I want to toggle the Exchange Rate mode between Manual and Auto-Sync from the Telegram settings menu, so that I can choose whether to set rates by hand or let the system sync them from Wallex.

2. As an Admin, I want the mode toggle to require an explicit confirmation step, so that I don't accidentally switch pricing modes.

3. As an Admin, I want the system to immediately fetch and verify a Wallex rate when I switch to Auto-Sync mode, so that I know the integration is working before it goes live.

4. As an Admin, I want the system to abort the switch to Auto-Sync and tell me if Wallex is unreachable, so that Buyers are never left without a valid rate.

5. As an Admin, I want to switch back to Manual mode and have the last synced rate remain active until I set a new one, so that top-ups are never blocked during the transition.

6. As an Admin, I want to configure the Spread percentage (0–10%) from the Telegram settings menu, so that the buyer-facing rate covers my operational costs and Wallex fees.

7. As an Admin, I want to see a concrete calculation example when I set the Spread (e.g., "If OTC rate is 90,500 TMN, buyer pays 91,857 TMN per USDT"), so that I understand the impact before confirming.

8. As an Admin, I want the current rate display (`💱 نرخ ارز فعلی`) to show the active Rate Mode, Spread percentage, and last update timestamp alongside the rate, so that I have full visibility into the pricing configuration.

9. As an Admin, I want the manual rate-setting command (`✏️ تنظیم نرخ ارز`) to be blocked with an informative message when Auto-Sync is active, so that I'm guided to switch modes first rather than making a change that gets silently overwritten.

10. As a Buyer, I want to see the same clean invoice display regardless of whether the rate is manual or auto-synced (just the locked exchange rate and the IRR amount I need to pay), so that the top-up experience is unchanged.

11. As a Buyer, I want my Top-Up Request to use the freshest possible exchange rate when I initiate it in Auto-Sync mode, so that the price I pay reflects the current market.

12. As a Buyer, I want my top-up to proceed even if Wallex is temporarily unreachable, falling back to a recent Baseline Rate, so that I'm not blocked by an external service outage.

13. As a Buyer, I want the exchange rate locked at the moment of initiation to never change after I see my invoice, regardless of market movements, so that I know exactly how much to transfer.

14. As an Admin, I want the system to automatically execute a Wallex OTC market buy for the USDT equivalent of a Top-Up after I approve it, so that the deposited fiat is converted to USDT without manual intervention.

15. As an Admin, I want the OTC Purchase execution to never block or delay the Buyer's wallet credit, so that the Buyer's experience is unaffected by Wallex availability.

16. As an Admin, I want to receive a detailed success notification in the ops Telegram group after each successful OTC Purchase (USDT received, TMN spent, executed price, fee, Wallex order ID), so that I have a clear audit trail.

17. As an Admin, I want to receive an immediate failure alert with error details and an inline Retry button when an OTC Purchase fails, so that I can investigate and re-trigger execution without leaving Telegram.

18. As an Admin, I want the Retry button on a failed OTC Purchase to create a new audit row rather than overwriting the failed one, so that I preserve the full history of attempts.

19. As an Admin, I want the system to enforce that only one OTC Purchase can be in PENDING or COMPLETED state per Top-Up Request, so that duplicate purchases are impossible even if multiple admins tap Retry.

20. As an Admin, I want OTC Purchase notifications to go to a dedicated ops Telegram group when configured, and fall back to Admin DMs when not, so that the feature works out of the box without requiring group setup.

21. As an Admin, I want the background Baseline Rate sync to use the bot's own Telegram ID for the `created_by_admin_telegram_id` field, so that I can clearly distinguish machine-generated rates from human-set rates in the rate display.

22. As an Admin, I want the periodic Baseline Rate sync to run every 60 minutes and always insert a fresh row, so that the fallback rate is never more than an hour stale.

23. As a system operator, I want the Wallex API key and base URL to be configured via environment variables, so that secrets are managed at the infrastructure level.

24. As a system operator, I want the system to gracefully handle Wallex API errors (auth failure, rate limit, maintenance) by marking OTC Purchases as FAILED with the error message recorded, so that failures are debuggable.

25. As a system operator, I want the exchange rate config table seeded by the migration with safe defaults (Manual mode, 0% Spread, 60-min sync interval), so that the system works identically to before until an Admin explicitly enables Auto-Sync.

26. As a future developer, I want the Wallex HTTP adapter separated from the OTC Purchase domain module, so that I can swap the exchange provider without touching business logic.

## Implementation Decisions

### New Database Tables

**`exchange_rate_config`** — Mutable single-row configuration table storing `mode` (`MANUAL` | `AUTO_SYNC`), `spread_percent` (numeric(5,2), 0–10%), `sync_interval_minutes` (integer, default 60), `updated_by_admin_telegram_id`, and timestamps. Singleton enforced via upsert pattern. Seeded with defaults in the migration.

**`wallex_otc_purchases`** — Audit table for OTC Purchase lifecycle. Columns: `top_up_request_id` (FK, not unique — multiple rows allowed for retry history), `usdt_quantity` (the buyer's `usd_amount`), `status` enum (`PENDING`, `COMPLETED`, `FAILED`), Wallex execution details (`wallex_client_order_id`, `wallex_executed_price`, `wallex_executed_qty`, `wallex_executed_sum`, `wallex_fee`), `error_message`, and timestamps. A partial unique index on `(top_up_request_id) WHERE status IN ('PENDING', 'COMPLETED')` prevents duplicate active purchases.

### Schema Migration: `top_up_requests`

- Add `locked_irr_per_usd` (bigint, NOT NULL after backfill) — the exact IRR-per-USD rate locked at initiation.
- Add `rate_source` (varchar, NOT NULL after backfill) — `'MANUAL'`, `'OTC_QUOTE'`, or `'BASELINE_FALLBACK'`.
- Make `exchange_rate_id` nullable — populated in Manual mode, NULL in Auto-Sync mode.
- Backfill existing rows: `locked_irr_per_usd = exchange_rates.irr_per_usd` via join, `rate_source = 'MANUAL'`.

### New Modules

**`src/modules/wallex/`** — Pure infrastructure HTTP adapter. Handles Wallex API authentication (`x-api-key` header), the two-step OTC flow (get price quote → place order within 15s TTL), TMN→IRR conversion at the boundary (`× 10`), and Wallex-specific error mapping. Env vars: `WALLEX_API_KEY`, `WALLEX_API_BASE_URL`.

**`src/modules/otc-purchase/`** — Domain module containing the `OtcPurchase` entity (state machine: `PENDING → COMPLETED | FAILED`), Drizzle schema, repository, and service. `OtcPurchaseService.execute()` coordinates: fetch OTC price quote, place OTC order, record result. `OtcPurchaseService.retry()` inserts a new PENDING row for a failed purchase's `top_up_request_id` and re-executes.

### Modified Modules

**`src/modules/exchange-rate/`** — Extended with `ExchangeRateConfigService` managing the `exchange_rate_config` singleton (get/update mode, spread, interval). The existing `ExchangeRateService` gains a `syncBaselineFromWallex()` method for the background job.

**`src/modules/top-up/`** — `TopUpService.initiateTopUp()` modified: in AUTO_SYNC mode, fetches an OTC Quote via the Wallex adapter, applies Spread, stores `locked_irr_per_usd` and `rate_source` inline, leaves `exchange_rate_id` NULL. Fallback: if the OTC Quote fetch fails, uses the latest Baseline Rate from `exchange_rates` and sets `rate_source = 'BASELINE_FALLBACK'`. `ApproveTopUpDependencies` extended with an optional `executeOtcPurchase` callback invoked after the DB transaction commits.

### Wallex API Integration

- **Rate Quote**: `GET /v1/account/otc/price?symbol=USDTTMN&side=BUY` (authenticated, ~15s TTL).
- **Order Execution**: `POST /v1/account/easy-trade/orders` with `{ symbol: 'USDTTMN', side: 'BUY', quantity: <usd_amount>, from: 'otc' }` (authenticated). The `quantity` parameter is in USDT (base asset).
- **TMN→IRR**: The adapter converts all TMN values to IRR (`× 10`) before returning to the domain layer. The domain never sees TMN.

### Background Worker

In-process `setInterval` managed by the application bootstrap. Runs only when Rate Mode is `AUTO_SYNC`. Timer started on boot (if mode is AUTO_SYNC) or on mode toggle. Timer stopped on toggle back to MANUAL. The sync function fetches an OTC price, converts TMN→IRR, and calls `ExchangeRateService.setRate()` with the bot's own Telegram ID as the admin identifier.

### Mode Toggle Lifecycle

- **MANUAL → AUTO_SYNC**: Immediately fetch a Wallex OTC quote and insert as the first Baseline Rate. If Wallex is unreachable, abort the toggle. Start the 60-minute sync timer.
- **AUTO_SYNC → MANUAL**: Stop the sync timer. The last synced Baseline Rate remains active until the Admin sets a new manual rate.

### OTC Purchase Lifecycle

- **Trigger**: After `TopUpService.approveTopUp()` commits the DB transaction and credits the wallet, the approval handler fires `OtcPurchaseService.execute()` asynchronously (fire-and-forget promise). A `wallex_otc_purchases` row is inserted with status `PENDING`.
- **Execution**: The service fetches a fresh OTC price quote, then immediately places the OTC order within the 15s TTL window. On success, updates the row to `COMPLETED` with Wallex execution details. On failure, updates to `FAILED` with `error_message`.
- **Notification**: Success and failure events are sent to `TELEGRAM_OPS_GROUP_ID` (if configured) or broadcast to individual Admin DMs via `ADMIN_IDS`.
- **Retry**: Admin taps the inline `[🔁 Retry]` button on a failure notification. A new `wallex_otc_purchases` row is inserted (preserving the failed row for audit) and execution retries. The partial unique index prevents concurrent PENDING rows.
- **No auto-retry** in v1. Failures are typically non-transient (insufficient TMN balance, API key issues).

### Admin Telegram UX

- `getAdminSettingsMenuKeyboard()` extended with `🔄 حالت نرخ ارز` (mode toggle) and `📊 تنظیم اسپرد` (spread config) buttons.
- Mode toggle: displays current mode + inline confirmation button. On confirm, executes the mode switch with immediate baseline fetch (for AUTO_SYNC).
- Spread config: grammY conversation prompting for a percentage, validated 0–10%, with calculation example in confirmation.
- Rate display: enriched with mode indicator and spread percentage in AUTO_SYNC mode.
- Set rate (`✏️ تنظیم نرخ ارز`): guarded in AUTO_SYNC mode with a warning message and inline button to switch to MANUAL.
- OTC retry: `callbackQuery(/^otc:retry:(.+)$/)` handler in the admin composer.

### New Environment Variables

- `WALLEX_API_KEY` (required for Auto-Sync and OTC execution)
- `WALLEX_API_BASE_URL` (optional, defaults to `https://api.wallex.ir`)
- `TELEGRAM_OPS_GROUP_ID` (optional, dedicated group for OTC notifications; falls back to `ADMIN_IDS`)

### Domain Model Updates

CONTEXT.md updated with 5 new terms under "Wallex Integration": Rate Mode, Spread, OTC Quote, Baseline Rate, OTC Purchase. Exchange Rate definition updated to reflect dual-mode sourcing and inline rate locking.

### Architecture Decision Record

ADR-0009 documents the hybrid on-demand OTC quote + periodic baseline fallback architecture, including the schema consequences (nullable `exchange_rate_id`, inline `locked_irr_per_usd`).

## Testing Decisions

### Testing Philosophy

Tests verify **external behavior through the service-level seam** against a real PostgreSQL test database. Internal implementation details (private methods, repository internals, entity construction) are not tested directly. The single new seam introduced by this feature is the `WallexClient` interface — the boundary between the system and the external exchange API.

### Seam: `WallexClient` Interface

All Wallex HTTP interactions are abstracted behind a `WallexClient` interface with two methods: `getOtcPrice(symbol, side)` and `placeOtcOrder(symbol, side, quantity)`. In production, the real HTTP adapter implements this interface. In tests, it is replaced with `vi.fn()` spies that return controlled responses or throw controlled errors. This is the **only new mock boundary** in the entire feature.

### Modules Under Test

**`OtcPurchaseService`** — Primary new test surface. Test with real DB against `wallex_otc_purchases` table:

- Happy path: execute after approval → row transitions to COMPLETED with Wallex details recorded.
- Wallex failure: execute with mocked failure → row transitions to FAILED with error message.
- Retry: insert new PENDING row for a failed purchase → re-execute → COMPLETED.
- Partial unique index enforcement: concurrent execute calls produce at most one COMPLETED row.
- Notification callback invoked on both success and failure (spied, not real Telegram).

**`ExchangeRateConfigService`** — New config CRUD. Test with real DB:

- Get/update mode, spread, interval.
- Upsert semantics on the singleton row.

**`TopUpService.initiateTopUp` (modified)** — Test the branching behavior:

- AUTO_SYNC mode + successful OTC quote → `locked_irr_per_usd` set from quote with spread, `rate_source = 'OTC_QUOTE'`, `exchange_rate_id = NULL`.
- AUTO_SYNC mode + failed OTC quote → fallback to latest baseline, `rate_source = 'BASELINE_FALLBACK'`, `exchange_rate_id` points to baseline row.
- MANUAL mode → existing behavior unchanged (`rate_source = 'MANUAL'`, `exchange_rate_id` populated).
- Spread calculation accuracy (decimal.js precision).

**`TopUpService.approveTopUp` (modified)** — Test the post-commit OTC trigger:

- Approval with `executeOtcPurchase` callback → callback invoked with correct top-up request data after commit.
- Approval with failing `executeOtcPurchase` → wallet credit still committed (fire-and-forget resilience, same pattern as existing `notifyBuyer` failure test).

**Baseline Sync Function** — Test as a unit function call (no timers in tests):

- Mocked `WallexClient.getOtcPrice()` → verify new `exchange_rates` row inserted with bot's Telegram ID and correct TMN→IRR conversion.
- Mocked failure → verify no row inserted, error logged.

**Bot Handlers** — Existing handler test pattern with `createMockContext` / `createMockFetch`:

- Mode toggle handler: confirmation flow, success/failure paths.
- Spread config handler: validation (out of range, valid input), confirmation.
- OTC retry handler: callback parsing, service invocation.
- Set-rate guard: blocked in AUTO_SYNC mode.

### Prior Art

- `tests/modules/top-up/top-up-approval.test.ts` — The template for testing post-approval side-effects via parameter dependencies.
- `tests/modules/top-up/top-up-initiation.test.ts` — The template for testing rate locking and calculation.
- `tests/modules/exchange-rate/exchange-rate.service.test.ts` — The template for append-only rate insertion.
- `tests/bot/admin/approve.test.ts` — The template for handler-level tests with mock contexts.

## Out of Scope

- **Automated bank-to-Wallex TMN deposits** — The Wallex API does not support programmatic fiat deposits. Admins pre-fund the Wallex TMN balance manually.
- **Auto-retry for failed OTC Purchases** — Deferred to v2. Most failures are non-transient (insufficient balance, API key issues). Manual retry via Telegram button is sufficient for v1.
- **WebSocket real-time rate streaming** — The periodic polling + on-demand quote hybrid provides sufficient freshness without the complexity of persistent WebSocket connections.
- **Multiple exchange provider support** — The `WallexClient` interface makes this possible later, but only Wallex is implemented in this phase.
- **Buyer-facing rate source transparency** — Buyers see the same clean invoice regardless of rate source. No "Live Market Rate" labels.
- **Audit dashboard or reporting UI** — OTC Purchase history is available in the database and via ops group notifications. A dedicated admin dashboard is a future concern.
- **Redis or pg-boss job queue** — The in-process `setInterval` + fire-and-forget pattern is adequate for the current scale (handful of approvals/day). Queue infrastructure is deferred to when scale demands it.

## Further Notes

- **TMN vs IRR** — Wallex quotes prices in TMN (Toman). The system's domain uses IRR (Rial). The conversion (`IRR = TMN × 10`) happens exclusively at the Wallex adapter boundary. No other layer in the system is aware of TMN.
- **Wallex OTC two-step flow** — The OTC API requires fetching a price quote first (`GET /v1/account/otc/price`), then placing the order within a ~15-second TTL window (`POST /v1/account/easy-trade/orders`). Both calls happen back-to-back in a single function invocation.
- **Wallex TMN balance** — The OTC buy requires sufficient TMN balance in the Wallex account. Admins must pre-fund this manually. Insufficient balance failures are surfaced as FAILED OTC Purchases with actionable admin alerts.
- **Migration safety** — The migration backfills `locked_irr_per_usd` from existing `exchange_rates` joins and seeds the config table. All changes are additive (new columns, new tables) or relaxing (nullable FK). No destructive changes to existing data.
- **Backward compatibility** — Until an Admin explicitly toggles to Auto-Sync mode, the system behaves identically to pre-RFP#3. The migration seeds Manual mode with 0% Spread.
