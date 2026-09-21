# 04: Order History view + order detail + cancel-from-detail

**What to build:** When a Buyer taps `[📦 تاریخچه سفارش‌ها]` on the Profile Card, the message is edited in place to show their recent order history, and they can drill into any order for full detail or cancel a PLACED order without leaving the hub.

The Order History list:

- Shows up to 5 most recent orders, each as an inline button: `<status emoji> <service name> — <date>` with callback data `account:order:<orderId>`.
- Shows an empty-state message prompting the Buyer to visit the shop if they have no orders.

The Order Detail view (reached via `account:order:<orderId>`):

- Edits the message to show full order detail: service name, price, status, date, and any rejection/delivery notes.
- If the order is `PLACED`, shows `[❌ لغو سفارش]` (reusing the existing `order:cancel:<orderId>` callback).
- Orders in `PROCESSING`, `FULFILLED`, `REJECTED`, or `CANCELLED` are read-only (no cancel button).
- Always shows `[🔙 بازگشت به لیست]` (callback `account:orders`).

Cancellation from detail uses the existing `order:cancel:<orderId>` callback; the success message (with refund amount and new balance) is already handled.

**Blocked by:** 03 (Profile Card must exist as the entry point)

**Status:** done

- [x] `account:orders` callback handler edits the message to the 5-order history list.
- [x] Orders beyond 5 are not shown.
- [x] Empty-state message shown when the Buyer has no orders.
- [x] `account:order:<orderId>` callback edits the message to the full detail view.
- [x] `[❌ لغو سفارش]` appears only on `PLACED` orders.
- [x] `[🔙 بازگشت به لیست]` is always present on the detail view.
- [x] Cancel-from-detail flow triggers the existing `order:cancel:<orderId>` callback correctly; refund confirmation message is shown.
- [x] `account.test.ts` extended to cover all of the above.
- [x] CI is green.
