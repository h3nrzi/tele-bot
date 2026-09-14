# 04: Baseline Rate Background Sync

**What to build:** An in-process `setInterval` worker managed by the application bootstrap that keeps the fallback Baseline Rate fresh while Auto-Sync mode is active. Demoable: switch to AUTO_SYNC, observe fresh `exchange_rates` rows appearing every interval with the bot's own Telegram ID as the creator.

- **Sync function** — Fetches an OTC price via `WallexClient.getOtcPrice()`, converts TMN→IRR (already handled by the adapter), and calls `ExchangeRateService.setRate()` with the bot's own Telegram ID as `created_by_admin_telegram_id`. On failure, logs the error and skips the insert (no crash, no stale row overwrite).

- **Timer management** — Timer started on boot if mode is `AUTO_SYNC`, or on mode toggle to `AUTO_SYNC`. Timer stopped on toggle back to `MANUAL`. Interval sourced from `exchange_rate_config.sync_interval_minutes` (default 60 min). The sync function is exported as a standalone callable for testing without timers.

- **Bootstrap wiring** — The `main()` function in `src/index.ts` (or a dedicated bootstrap module) resolves the config on startup and conditionally starts the timer. The mode toggle handler (from ticket 03) calls the start/stop functions.

**Blocked by:** 03 (needs ExchangeRateConfigService and mode toggle wiring).

**Status:** completed

- [x] Sync function fetches OTC price and inserts a Baseline Rate with bot's Telegram ID
- [x] Sync function gracefully handles Wallex failures (logs error, no crash)
- [x] Timer starts on boot when mode is AUTO_SYNC
- [x] Timer starts/stops on mode toggle
- [x] Interval sourced from config table
- [x] Sync function exported as a standalone callable for unit testing
- [x] Unit tests with mocked WallexClient verify row insertion and error handling (no timer tests)
