# Hybrid on-demand OTC quote with periodic baseline fallback for exchange rates

In Auto-Sync Rate Mode, buyer-facing exchange rates are sourced from the Wallex OTC pricing engine via a two-tier strategy rather than a single polling loop or a single on-demand fetch.

**Tier 1 — On-demand OTC Quote.** When a Buyer initiates a Top-Up Request, the system fetches a fresh authenticated OTC price (`GET /v1/account/otc/price?symbol=USDTTMN&side=BUY`), applies the Admin-configured Spread, converts TMN to IRR at the adapter boundary (`× 10`), and locks the resulting `irr_per_usd` inline on the `top_up_requests` row (`locked_irr_per_usd`, `rate_source = 'OTC_QUOTE'`). This quote is _not_ inserted into `exchange_rates`.

**Tier 2 — Periodic Baseline Sync.** A `setInterval` background job polls Wallex every 60 minutes and unconditionally inserts a new row into the append-only `exchange_rates` table (using the bot's own Telegram ID as `created_by_admin_telegram_id`). This baseline row serves as the fallback if the on-demand fetch in Tier 1 fails or times out.

**Why not pure polling?** A 60-second poll cycle writes 1,440 rows/day and still shows a rate up to 60 seconds stale at initiation time. The authenticated OTC endpoint is the same pricing engine used for order execution, so polling the public markets endpoint would introduce a spread discrepancy between what the buyer sees and what the system actually pays on Wallex.

**Why not pure on-demand?** If Wallex is temporarily unreachable at the moment a buyer initiates a top-up, the flow fails entirely with no fallback. The baseline guarantee means top-ups degrade gracefully to a rate at most 60 minutes old rather than blocking.

**Schema consequence:** `top_up_requests.exchange_rate_id` becomes nullable. In Manual Rate Mode it still points to the admin-set `exchange_rates` row. In Auto-Sync mode it is `NULL` and the rate lives inline in `locked_irr_per_usd` with `rate_source` indicating the origin (`OTC_QUOTE` or `BASELINE_FALLBACK`). Existing rows are backfilled with `locked_irr_per_usd` from the joined exchange rate and `rate_source = 'MANUAL'`.
