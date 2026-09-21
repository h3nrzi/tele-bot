# 01: Credential Crypto Service & Polymorphic Catalog Data Model

**What to build:** Establish the schema and cryptographic foundations for polymorphic service catalog items and encrypted buyer input handling.
- Define `catalog_type` enum (`STATIC_DELIVERY`, `DIRECT_ACCOUNT`, `IDENTITY_HANDLE`, `CONFIG_VPN`) with default `'STATIC_DELIVERY'`.
- Define `fulfillment_strategy` enum (`PAYLOAD_DELIVERY`, `ACTIVATION`, `AUTOMATED_PANEL`) with default `'PAYLOAD_DELIVERY'`.
- Add `catalog_type`, `fulfillment_strategy`, and nullable `requirement_config` JSONB to `catalog_items`.
- Add `fulfillment_strategy_snapshot` (default `'PAYLOAD_DELIVERY'`) and nullable `buyer_inputs` JSONB to `orders`.
- Create a dedicated credential cryptographic service implementing AES-256-GCM encryption and decryption using `CREDENTIALS_ENCRYPTION_KEY`, producing `{ ciphertext, iv, tag }`.
- Ensure backward compatibility: all existing catalog items, orders, and tests continue operating without modification.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Database schema includes `catalog_type` and `fulfillment_strategy` enums, new columns on `catalog_items` and `orders`, and migrations run cleanly.
- [x] Domain entities and repository layer expose the new polymorphic fields.
- [x] Credential crypto service encrypts plaintext strings into `{ ciphertext, iv, tag }` and successfully decrypts them using AES-256-GCM.
- [x] Attempting decryption with an invalid key, corrupted tag, or tampered ciphertext throws an error.
- [x] Missing or invalid `CREDENTIALS_ENCRYPTION_KEY` environment variable fails fast on startup or crypto service invocation.
- [x] All existing automated tests continue to pass.
