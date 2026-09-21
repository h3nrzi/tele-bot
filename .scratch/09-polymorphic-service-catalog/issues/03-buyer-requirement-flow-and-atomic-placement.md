# 03: Buyer Pre-Placement Requirement Flow & Atomic Order Placement

**What to build:** Guide Buyers purchasing items with dynamic requirements through an interactive step-by-step collection flow, protecting credentials and preserving atomic placement.

- When a Buyer selects a catalog item from `/shop`, a fail-fast Available Balance check verifies they can afford the item; if underfunded, the bot immediately warns them and does not enter the conversation.
- For items requiring inputs (`DIRECT_ACCOUNT`, `IDENTITY_HANDLE`, `CONFIG_VPN`), an interactive conversation collects and validates inputs:
  - `DIRECT_ACCOUNT`: Prompts for email (format validated) and password. Raw password messages sent by the Buyer are deleted immediately from the chat, and the password is encrypted using the crypto service.
  - `IDENTITY_HANDLE`: Prompts for target `@username` or numeric Telegram ID with format validation.
  - `CONFIG_VPN`: Renders an inline keyboard of allowed regions from the item's configuration.
  - `STATIC_DELIVERY`: Skips requirement collection directly to the order confirmation view.
- Supports cancellation at any step without debiting the wallet or creating an order.
- Displays a final order confirmation summary showing item details, USD price, balance breakdown, and submitted inputs with the password masked (`••••••••`).
- Upon confirmation, atomically debits the wallet, creates a double-entry ledger transaction, snapshots the item's `fulfillment_strategy`, and saves the encrypted `buyer_inputs` on the Order in status `PLACED`.

**Blocked by:** 01 (Credential Crypto Service & Polymorphic Catalog Data Model)

**Status:** done

- [x] Underfunded buyers are stopped immediately before any input prompts appear.
- [x] Buyer input collection conversation validates email format, handles, and region choices according to the catalog item type.
- [x] Buyer's raw password message in Telegram is deleted immediately upon receipt.
- [x] Buyer can cancel the collection flow at any step with zero wallet debits or database side effects.
- [x] Final confirmation prompt displays masked password (`••••••••`) and all submitted metadata.
- [x] Order placement atomically debits the wallet, records ledger entries, and stores `fulfillment_strategy_snapshot` with encrypted `buyer_inputs`.
- [x] End-to-end bot tests verify the full requirement flow for each catalog type, message deletion, and database placement.
