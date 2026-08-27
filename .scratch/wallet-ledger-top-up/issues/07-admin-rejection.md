# 07: Admin rejection

**What to build:** An Admin taps the **Reject** inline button on a pending receipt notification. The bot presents a set of preset rejection reason buttons (e.g., "Wrong amount", "Unreadable receipt", "Duplicate submission") plus a "Custom…" option. The Admin selects a preset or types a free-text note. The Top-Up Request is marked `REJECTED`, and the Buyer immediately receives a notification that includes the full rejection category and any custom note verbatim, so they know exactly how to resubmit correctly. If another Admin has already acted on the same request, the rejecting Admin sees "already processed" and the Buyer is not notified again.

**Blocked by:** 05 — Receipt submission + Admin push notification

**Status:** done

- [x] Admin rejection service accepts `(requestId, adminTelegramId, rejectionReason: string)` and executes inside a single PostgreSQL transaction: (1) `SELECT … FROM top_up_requests WHERE id = ? FOR UPDATE`; (2) assert `status = 'PENDING'` — if not, abort and return an "already processed" error; (3) `UPDATE top_up_requests SET status = 'REJECTED', rejection_reason = ?, processed_by_admin_telegram_id = ?, processed_at = now()`.
- [x] No Ledger rows are written on rejection. The Buyer's `available_balance` is unchanged.
- [x] Inline **Reject** callback handler: verifies the caller is an Admin, opens a grammY `conversations` session, presents an inline keyboard with preset reasons: "Wrong amount", "Unreadable receipt", "Duplicate submission", "Other / custom…". If "Other / custom…" is selected, the bot prompts the Admin to type a free-text message. The final `rejection_reason` stored in the DB combines the selected category with any custom note (e.g., `"Wrong amount — you sent 5,900,000 IRR but the request was for 6,200,000 IRR"`).
- [x] After the rejection is committed, the original Admin notification message is edited to reflect the outcome (rejected, by whom).
- [x] Buyer push notification: sent after the transaction commits. Message includes the rejection reason category and the full custom note verbatim. If no custom note was provided, only the category is shown. Failure to send does not roll back the transaction.
- [x] The rejection conversation can be cancelled by the Admin at any step (e.g., via a "Cancel" button or by sending `/cancel` inside the conversation); cancellation leaves the request in `PENDING`.
- [x] Rejection service tests cover: preset reason stored correctly and status → `REJECTED`; custom reason stored correctly; combined preset + custom note stored correctly; multi-Admin race — second rejection (or approval vs rejection) on an already-processed request returns "already processed" and does not modify the row a second time; `processed_by_admin_telegram_id` and `processed_at` are set on the persisted row.
- [x] No test calls the Telegram notification API; notification dispatch is injected as a dependency and stubbed in tests.

