# 01: Wallex HTTP Adapter & WallexClient Interface

**What to build:** A standalone `src/modules/wallex/` module that abstracts all Wallex API interactions behind a `WallexClient` interface with two methods: `getOtcPrice(symbol, side)` and `placeOtcOrder(symbol, side, quantity)`. The HTTP implementation authenticates via `x-api-key` header, handles the two-step OTC flow (price quote → place order within 15s TTL), converts all TMN values to IRR (`× 10`) at the boundary so the domain never sees TMN, and maps Wallex-specific errors into domain-friendly error types. Environment variables `WALLEX_API_KEY` (required) and `WALLEX_API_BASE_URL` (optional, defaults to `https://api.wallex.ir`) are wired via the existing env config pattern. The module exports only the interface and a factory/constructor for the HTTP implementation — no domain logic lives here.

**Blocked by:** None (can start immediately).

**Status:** completed

- [x] `WallexClient` interface defined with `getOtcPrice` and `placeOtcOrder` signatures
- [x] HTTP implementation handles `GET /v1/account/otc/price?symbol=USDTTMN&side=BUY` for price quotes
- [x] HTTP implementation handles `POST /v1/account/easy-trade/orders` for order placement
- [x] TMN→IRR conversion (`× 10`) applied at the adapter boundary on all price/sum values
- [x] Wallex API errors (auth failure, rate limit, maintenance) mapped to typed domain errors
- [x] `WALLEX_API_KEY` and `WALLEX_API_BASE_URL` env vars wired
- [x] Unit tests with mocked HTTP verify quote parsing, order placement, TMN→IRR conversion, and error mapping
