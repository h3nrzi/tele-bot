# At-Rest Encryption and Selective Redaction of Buyer Inputs

We store inbound buyer requirements in `orders.buyer_inputs` (JSONB) with sensitive fields (e.g. third-party account passwords) encrypted at rest using AES-256-GCM. When an order transitions to a terminal state (`FULFILLED`, `REJECTED`, `CANCELLED`), sensitive credential fields are selectively overwritten with `[REDACTED]`, while operational identifiers (email, handle, server region) are preserved for audit history.

## Context & Rationale

Direct account upgrades (ChatGPT, Spotify) require buyers to provide third-party credentials (email and password). Storing unencrypted plaintext passwords in the database indefinitely poses an unacceptable security risk in the event of database dumps, backup exposure, or compromised read replicas. Conversely, completely omitting credentials from persistence breaks admin workflows if push notifications fail or when an admin needs to inspect an order from the admin dashboard during active processing.

Furthermore, wiping the entire `buyer_inputs` column upon completion would eliminate the audit trail: neither buyer nor admin could confirm which email or handle was upgraded if a dispute arises.

## Considered Options

**Option A — Plaintext storage in JSONB.** Store raw credentials permanently in `orders.buyer_inputs`. Rejected due to unacceptable risk of active credential leakage from database backups or unauthorized access.

**Option B — Zero database persistence (Ephemeral Telegram notifications only).** Pass credentials only in the Telegram push message and never store them in PostgreSQL. Rejected because any transient Telegram delivery failure or message deletion leaves the order unfulfillable and uninspectable.

**Option C — Complete erasure upon completion.** Set `orders.buyer_inputs` to `NULL` upon terminal state. Rejected because it destroys operational provenance (e.g. proof of target email/username).

**Option D (chosen) — AES-256-GCM at rest with selective terminal redaction.** Passwords are encrypted before database insertion using an application master secret (`CREDENTIALS_ENCRYPTION_KEY`). Telegram messages containing raw passwords are deleted from the chat immediately after receipt. Upon transition to `FULFILLED`, `REJECTED`, or `CANCELLED`, password fields in `buyer_inputs` are updated to `[REDACTED]` while non-sensitive attributes (`email`, `targetUsername`, `region`) remain permanently intact.

## Consequences

- An application secret `CREDENTIALS_ENCRYPTION_KEY` (32-byte hex or base64) is required in the environment.
- The order service and domain layer handle encryption before saving and decryption only when authorized callers inspect an active order.
- In terminal states, credentials cannot be retrieved; customer support can verify identity metadata but cannot view historical passwords.
- Telegram chat history between buyer and bot does not retain plaintext password messages.
