# 05: Top-Up Initiation — Dual-Mode Rate Locking

**What to build:** Modified `TopUpService.initiateTopUp()` that branches on Rate Mode to lock the exchange rate inline on the Top-Up Request. Demoable: Buyer initiates a top-up in AUTO_SYNC mode and sees an invoice with the OTC-sourced rate; same clean display regardless of mode.

- **AUTO_SYNC + OTC Quote succeeds** — Fetch an on-demand OTC Quote via `WallexClient.getOtcPrice()`, apply Spread from `exchange_rate_config`, store `locked_irr_per_usd` (the spread-adjusted rate), `rate_source = 'OTC_QUOTE'`, `exchange_rate_id = NULL`. Compute `irr_amount` from the locked rate.

- **AUTO_SYNC + OTC Quote fails** — Fall back to the latest Baseline Rate from `exchange_rates`. Store `locked_irr_per_usd` from that row, `rate_source = 'BASELINE_FALLBACK'`, `exchange_rate_id` pointing to the baseline row.

- **MANUAL mode** — Existing behavior unchanged. `locked_irr_per_usd` populated from the current exchange rate, `rate_source = 'MANUAL'`, `exchange_rate_id` populated.

- **Spread calculation** — Use decimal.js (or equivalent) for precision: `buyer_rate = otc_irr_per_usd × (1 + spread_percent / 100)`, rounded to the nearest integer.

- **Buyer UX unchanged** — The invoice display logic uses `locked_irr_per_usd` and `irr_amount` regardless of source. No "Live Market Rate" labels or rate source disclosure to Buyers.

**Blocked by:** 03 (needs ExchangeRateConfigService for mode/spread lookup and WallexClient).

**Status:** ready-for-agent

- [ ] `initiateTopUp()` branches on Rate Mode from `ExchangeRateConfigService`
- [ ] AUTO_SYNC path fetches OTC Quote, applies Spread, stores `locked_irr_per_usd` and `rate_source = 'OTC_QUOTE'`
- [ ] AUTO_SYNC fallback uses latest Baseline Rate with `rate_source = 'BASELINE_FALLBACK'`
- [ ] MANUAL path stores `locked_irr_per_usd` from current rate with `rate_source = 'MANUAL'`
- [ ] `exchange_rate_id` is NULL for OTC_QUOTE, populated for MANUAL and BASELINE_FALLBACK
- [ ] Spread calculation uses decimal precision
- [ ] `irr_amount` computed from `locked_irr_per_usd × usd_amount`
- [ ] Buyer invoice display uses `locked_irr_per_usd` uniformly
- [ ] Integration tests: AUTO_SYNC + successful quote, AUTO_SYNC + failed quote fallback, MANUAL mode unchanged
- [ ] Spread calculation accuracy tests
