# Telegram file_id for receipt photo storage

Receipt photos uploaded by Buyers are stored as Telegram `file_id` strings in the database rather than downloading and persisting the binary to object storage (S3/MinIO).

This avoids provisioning and operating object storage in the MVP deployment, significantly reducing infrastructure complexity.

**Known risk**: Telegram's file retention policy is not publicly guaranteed. In practice, files uploaded to bots are retained indefinitely for active bots, but this is not contractually assured. If a `file_id` expires, the Admin can no longer retrieve the receipt photo for that Top-Up Request.

This decision should be revisited — and object storage added — if:
- Compliance or legal requirements demand owning the receipt binary.
- Telegram file expiry causes retrieval failures in production.
- Receipt images need to be embedded in financial reports generated outside Telegram.

## Status

accepted — revisit before any compliance audit.
