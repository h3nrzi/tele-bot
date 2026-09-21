# Decoupled Catalog Type, Fulfillment Strategy, and Order Strategy Snapshot

We decoupled inbound buyer requirement specification (`catalog_type`) from outbound execution (`fulfillment_strategy`) on `catalog_items`, and introduced an immutable `fulfillment_strategy_snapshot` on `orders`. When an Order is placed, the item's fulfillment strategy is permanently snapshotted onto the Order row, ensuring in-flight orders remain deterministic and insulated from subsequent catalog modifications.

## Context & Rationale

Our service catalog previously treated all items identically: every order followed a uniform flow where an Admin typed outbound delivery text (`delivery_content`) upon fulfillment. Expanding the catalog to support direct account upgrades (ChatGPT, Spotify), identity/handle credits (Telegram Premium Gifts), and configuration-based services (VPN) requires different input gathering rules and fulfillment mechanisms. Furthermore, configuration-based products like VPN are fulfilled manually via Admin-delivered subscription links in MVP, but will transition to automated background API fulfillment (Marzban/Sanaei) post-MVP.

Tying fulfillment execution directly to the catalog item type would create severe rigidity: migrating VPNs to automated panels would require either breaking database migrations or introducing artificial duplicate types (e.g. `CONFIG_VPN_AUTO`). By separating `catalog_type` (which controls buyer prompts and validation strategies) from `fulfillment_strategy` (which dictates how the order lifecycle completes), an Admin can switch an item's fulfillment mechanism from manual `PAYLOAD_DELIVERY` to `AUTOMATED_PANEL` without changing how buyer inputs are collected or breaking existing database records.

Snapshotting `fulfillment_strategy_snapshot` on `orders` (alongside `usd_price_snapshot`) guarantees that existing placed or processing orders execute under the strategy in effect when the buyer confirmed their purchase, even if the admin updates the catalog item mid-flight.

## Considered Options

**Option A — 1:1 Inherent Strategy (`catalog_type` dictates fulfillment).** Each catalog type hardcodes its fulfillment behavior in code. Rejected because it forces catalog types to duplicate when fulfillment methods evolve (e.g. `CONFIG_VPN_MANUAL` vs `CONFIG_VPN_AUTOMATED`) and couples presentation models with backend delivery pipelines.

**Option B (chosen) — Decoupled `catalog_type` and `fulfillment_strategy` with Order snapshot.** `catalog_items` defines both `catalog_type` (inbound requirements) and `fulfillment_strategy` (outbound mechanism). `orders` captures `fulfillment_strategy_snapshot` at placement time.

## Consequences

- `catalog_items` gains `catalog_type` and `fulfillment_strategy` enum columns, plus an optional `requirement_config` JSONB column for catalog-level options (e.g. allowed VPN regions).
- `orders` gains `fulfillment_strategy_snapshot` (enum) and `buyer_inputs` (JSONB).
- Fulfilling an order evaluates `order.fulfillment_strategy_snapshot`:
  - `ACTIVATION`: One-click confirmation prompt without requiring redundant text input; dispatches an activation notification to the buyer.
  - `PAYLOAD_DELIVERY`: Retains the 3-step grammY conversation for the Admin to input `Delivery Content`.
  - `AUTOMATED_PANEL`: Executed asynchronously by a panel worker with manual fallback.
