# 03: ExchangeRateConfigService & Rate Mode Toggle (Domain + Admin UX)

**What to build:** The full end-to-end Rate Mode and Spread management flow — from domain service through Admin Telegram UX — so an Admin can toggle between Manual and Auto-Sync modes, configure Spread, and see an enriched rate display. Demoable: Admin taps the mode toggle button, sees confirmation, system fetches a Wallex rate and inserts it as the first Baseline Rate (or aborts if Wallex is unreachable), Spread is configurable with a calculation example, and the rate display shows the active mode/spread/timestamp.

- **`ExchangeRateConfigService`** — CRUD on the `exchange_rate_config` singleton: get current config, update mode, update spread, update interval. Upsert semantics.

- **Mode toggle lifecycle** — `MANUAL → AUTO_SYNC`: immediately fetch a Wallex OTC quote via `WallexClient`, insert as the first Baseline Rate; abort and inform Admin if Wallex is unreachable. `AUTO_SYNC → MANUAL`: last synced rate stays active until Admin sets a new manual rate. Confirmation step required before switching.

- **Spread config** — grammY conversation prompting for a percentage (0–10%), validation, calculation example in confirmation (e.g., "If OTC rate is 90,500 TMN, buyer pays 91,857 TMN per USDT").

- **Admin Telegram UX** — `getAdminSettingsMenuKeyboard()` extended with `🔄 حالت نرخ ارز` and `📊 تنظیم اسپرد` buttons. Rate display (`💱 نرخ ارز فعلی`) enriched with mode indicator, spread percentage, and last update timestamp. Manual set-rate (`✏️ تنظیم نرخ ارز`) guarded with a warning and inline switch-to-MANUAL button when Auto-Sync is active.

**Blocked by:** 01 (WallexClient needed for connectivity verification on mode toggle), 02 (exchange_rate_config table).

**Status:** completed

- [x] `ExchangeRateConfigService` with get/update for mode, spread, and interval
- [x] Mode toggle handler with confirmation step
- [x] `MANUAL → AUTO_SYNC` transition fetches and inserts first Baseline Rate, aborts on failure
- [x] `AUTO_SYNC → MANUAL` transition preserves last synced rate
- [x] Spread config handler with 0–10% validation and calculation example
- [x] Settings menu keyboard extended with mode toggle and spread config buttons
- [x] Rate display enriched with mode, spread, and timestamp in AUTO_SYNC mode
- [x] Manual set-rate guarded in AUTO_SYNC mode with informative message
- [x] DI tokens and container registrations for new service
- [x] Handler-level tests for mode toggle, spread config, and set-rate guard
- [x] `ExchangeRateConfigService` integration tests against real DB
