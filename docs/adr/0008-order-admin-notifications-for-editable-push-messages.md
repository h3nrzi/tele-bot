# order_admin_notifications join table for editable Admin push messages

When an Order is placed, one `order_admin_notifications` row is written per Admin, recording the `chat_id` and `message_id` of each Telegram push message sent to that Admin. The order claim, rejection, cancellation, and fulfilment services read this table to call `editMessageReplyMarkup` on every Admin's copy of the notification, keeping inline buttons current with the order's actual status.

We considered leaving notifications static and relying solely on database-level errors when Admins tap stale buttons. This is simpler to implement but creates a poor operational experience: an Admin team of three sees three copies of a notification with live "Start Processing" buttons long after one Admin has already claimed the order. Stale buttons cause confusion and unnecessary error messages.

The `order_admin_notifications` table adds one insert per Admin per Order at placement time (negligible overhead) and enables all subsequent notification edits to happen without storing any additional state. The same table is reused by every lifecycle transition that needs to update Admin UI — claim, cancel, reject, fulfil — making it the single source of truth for "where did we send this notification?"

Notification edits are dispatched outside the database transaction and fire-and-forget: a Telegram API failure to edit a message does not roll back the order state change.
