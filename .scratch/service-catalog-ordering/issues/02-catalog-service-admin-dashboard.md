# 02: Catalog service + `/catalog` Admin dashboard

**Status:** ready-for-agent

**Blocked by:** 01 — Schema migration & Drizzle types

**What to build:** Admins can manage the full Catalog Item lifecycle from a single `/catalog` command. The catalog service provides the core operations, and the Admin handler wires them into an inline-keyboard dashboard with guided grammY conversations for add and edit flows.

- Implement the catalog service with five operations: create Catalog Item (name, description, usd_price); list all Catalog Items (active + inactive, for Admin view); list active Catalog Items only (for Buyer `/shop`, reused in ticket 03); edit Catalog Item fields (name, description, usd_price individually or together); toggle `is_active`.
- Register the `/catalog` Admin command. The dashboard shows all Catalog Items as an inline keyboard. Each item row has `[Edit]` and `[Deactivate]` / `[Reactivate]` buttons. A `[+ Add New]` button appears at the bottom.
- `[+ Add New]` opens a grammY conversation: prompt for name → description (with `[Skip]` option) → price → confirmation. On confirm, the new Catalog Item is created and the dashboard is refreshed.
- `[Edit]` opens a grammY conversation: prompt for each field in sequence (pre-filled with current value), allow `[Keep]` to skip unchanged fields, then update and refresh.
- `[Deactivate]` / `[Reactivate]` toggles `is_active` immediately (no confirmation step) and refreshes the dashboard.
- Write unit tests for the catalog service covering: create; list-active excludes inactive items; list-all includes both; edit updates only the specified fields; deactivate hides from list-active; reactivate restores.

## Acceptance criteria

- [x] `/catalog` is restricted to Admin users; non-Admins receive an access-denied message.
- [x] The dashboard renders all Catalog Items with correct active/inactive indicators.
- [x] `[+ Add New]` completes the guided conversation and the new item appears in the dashboard.
- [x] `[Edit]` updates the selected fields and leaves unedited fields unchanged.
- [x] `[Deactivate]` sets `is_active = false`; the item no longer appears in `listActive` results.
- [x] `[Reactivate]` sets `is_active = true`; the item reappears in `listActive` results.
- [x] All catalog service unit tests pass.
- [x] TypeScript compiles without errors.
