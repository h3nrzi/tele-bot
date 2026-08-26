# 05: Receipt submission + Admin push notification

**What to build:** A Buyer sends a photo of their bank transfer receipt (with an optional text caption) to the bot. The bot checks the `INITIATED` request is still within its expiry window, transitions it to `PENDING`, and immediately forwards the receipt photo — along with the requested USD amount, the IRR amount the Buyer was instructed to transfer, and inline **Approve** and **Reject** buttons — to every configured Admin. The Admin notification arrives within seconds of the Buyer uploading the photo. If the Buyer's request has expired, they see a clear message telling them to start a new request.

**Blocked by:** 04 — Top-Up initiation (/topup)

**Status:** done

- [x] Receipt submission service accepts `(userId, fileId, caption?)` and performs the following: fetches the Buyer's active `INITIATED` request; if none exists, returns a "no active request" error; checks `expires_at < now()` — if so, updates status to `EXPIRED` and returns an expiry error; otherwise, updates status to `PENDING`, sets `receipt_file_id` and `receipt_caption`, and returns the updated request.
- [x] The status transition and receipt field update happen in a single `UPDATE` statement (or transaction) — no partial writes.
- [x] Photo message handler: fires when the Buyer sends a photo while they have an `INITIATED` request. Calls the receipt submission service and replies to the Buyer confirming the receipt is under review.
- [x] If the Buyer sends a photo when they have no active `INITIATED` request (e.g., already `PENDING`, or no request at all), the bot replies with a contextual explanation.
- [x] Admin notification: after a successful `PENDING` transition, the bot sends a message to every Telegram chat ID in `ADMIN_IDS` containing: the Buyer's Telegram username or ID, the requested USD amount, the IRR amount they were instructed to transfer, the receipt photo (forwarded via `file_id`), the optional caption if present, and inline **Approve** and **Reject** buttons whose callback data encodes the `top_up_request_id`.
- [x] Admin notification is sent after the DB write is committed; a failure to notify does not roll back the `PENDING` transition.
- [x] Receipt submission service tests cover: happy path (status → `PENDING`, `receipt_file_id` and `receipt_caption` persisted), expired request (status → `EXPIRED`, error returned, no partial write), calling the service with no `INITIATED` request (error returned, no DB mutation), `receipt_caption` is correctly stored as `null` when not provided.
