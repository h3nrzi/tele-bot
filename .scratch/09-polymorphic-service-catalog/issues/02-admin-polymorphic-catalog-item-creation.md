# 02: Admin Polymorphic Catalog Item Creation Flow

**What to build:** Enhance the Admin catalog creation flow in `/admin` to support polymorphic items.

- In the item creation conversation, prompt the Admin to select a `CatalogType` from an inline keyboard (`STATIC_DELIVERY`, `DIRECT_ACCOUNT`, `IDENTITY_HANDLE`, `CONFIG_VPN`).
- Automatically pre-select the appropriate default `FulfillmentStrategy` based on the chosen catalog type (e.g. `DIRECT_ACCOUNT` defaults to `ACTIVATION`, `STATIC_DELIVERY` and `CONFIG_VPN` default to `PAYLOAD_DELIVERY`), while offering an option to customize or override it.
- When `CONFIG_VPN` is chosen, prompt the Admin to select or configure allowed server region presets (stored in `requirement_config`).
- Present a final preview prompt displaying the catalog type, fulfillment strategy, and configuration before the Admin confirms persistence.

**Blocked by:** 01 (Credential Crypto Service & Polymorphic Catalog Data Model)

**Status:** done

- [x] Admin adding a catalog item is prompted to select a `CatalogType` via inline buttons.
- [x] The conversation auto-suggests the matching default `FulfillmentStrategy` and allows confirmation or override.
- [x] Selecting `CONFIG_VPN` allows configuring server region options saved into `requirement_config`.
- [x] Preview prompt shows catalog type, fulfillment strategy, price, and region options prior to final confirmation.
- [x] Newly created polymorphic items persist correctly to the database with active status.
- [x] End-to-end bot tests cover creating each catalog item type with its respective fulfillment strategy.
