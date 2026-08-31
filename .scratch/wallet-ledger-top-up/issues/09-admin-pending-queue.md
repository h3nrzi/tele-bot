# 09: Admin queue (/pending)

**What to build:** An Admin sends `/pending` and receives a list of all Top-Up Requests currently in `PENDING` status, each showing the Buyer identity, the requested USD amount, the IRR amount, and when the receipt was submitted. Each list entry has an inline **Review** button that forwards the Admin directly to the relevant receipt notification (or re-sends the receipt details if the original message is no longer accessible). If no requests are pending, the bot confirms the queue is empty.

**Blocked by:** 05 — Receipt submission + Admin push notification

**Status:** done

- [x] Admin queue service: `getPendingRequests()` returns all `top_up_requests` rows where `status = 'PENDING'`, ordered by `created_at` ascending (oldest first), joined with the `users` table to include `telegram_chat_id` and `telegram_username`.
- [x] `/pending` Admin command: calls `getPendingRequests()`. If the result is empty, replies with a "queue is empty" message. If results exist, formats each as a summary line (Buyer identifier, USD amount, IRR amount, time since submission) with an inline **Review** button. The **Review** button callback re-sends the full receipt details (photo, amounts, inline Approve/Reject buttons) for that specific request to the Admin in a new message.
- [x] The **Review** button callback re-uses the same Approve/Reject inline button logic from ticket 05/06/07: the Admin can approve or reject directly from the re-sent message.
- [x] `/pending` is silently ignored when sent by a non-Admin.
- [x] The list is paginated if more than 10 requests are pending: inline **Next →** and **← Prev** navigation buttons are shown when the queue exceeds one page.
- [x] Admin queue service tests cover: empty queue returns an empty array; single `PENDING` request returned; multiple `PENDING` requests returned in ascending creation order; requests in `INITIATED`, `APPROVED`, `REJECTED`, `EXPIRED`, or `CANCELLED` status are not included.

