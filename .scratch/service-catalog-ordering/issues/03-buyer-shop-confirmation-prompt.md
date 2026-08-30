# 03: Buyer `/shop` + order confirmation prompt

**Status:** done

**Blocked by:** 02 — Catalog service + `/catalog` Admin dashboard

**What to build:** Buyers can browse active Catalog Items and reach an order confirmation prompt. No order is placed in this ticket — the Confirm button is a stub that will be activated in ticket 04.

- Register the `/shop` Buyer command. It calls `listActive` from the catalog service and renders active Catalog Items as an inline keyboard (one button per item showing name and price).
- If no active items exist, respond with a friendly "nothing available right now" message.
- Tapping an item displays a confirmation prompt: Catalog Item name, description (if present), USD price, and the Buyer's current Available Balance. Two inline buttons: `[✓ Confirm]` (stub — wired in ticket 04) and `[✗ Cancel]`.
- If the Buyer's Available Balance is below the item price, the confirmation prompt instead shows a clear insufficient-balance error with a suggestion to top up. The Confirm button is absent in this error state.
- `[✗ Cancel]` dismisses the prompt; the Buyer can restart with `/shop`.

## Acceptance criteria

- [x] `/shop` shows only active Catalog Items; deactivated items do not appear.
- [x] Tapping an item shows name, description (if present), price, and current Available Balance.
- [x] When balance ≥ price, the `[✓ Confirm]` button is present.
- [x] When balance < price, a clear error message is shown and the `[✓ Confirm]` button is absent.
- [x] `[✗ Cancel]` dismisses the prompt without any side effects.
- [x] `/shop` with no active items shows a graceful empty-state message.
- [x] TypeScript compiles without errors.

