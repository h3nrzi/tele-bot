# 03: Profile Card — `/account` + `👤 حساب کاربری` handler

**What to build:** Wire the Account Hub entry point. A Buyer who types `/account` or taps `👤 حساب کاربری` receives a single Telegram message — the Profile Card — that aggregates all their account data in one place.

The Profile Card message shows:
- Telegram ID and username (via `Buyer.getDisplayName()` and the raw ID).
- Registration date.
- Available Balance.
- Order-status breakdown: ✅ Fulfilled / ⏳ In Progress / ❌ Cancelled counts.
- If an active Top-Up Request exists:
  - `INITIATED` state → instructional copy telling the Buyer to submit their receipt; no cancel button.
  - `PENDING` state → informational copy plus an inline `[❌ لغو درخواست]` button.
- Two navigation inline buttons always present: `[📦 تاریخچه سفارش‌ها]` (`account:orders`) and `[💳 تاریخچه تراکنش‌ها]` (`account:transactions`).

All new callbacks use the `account:` namespace. The `[❌ لغو درخواست]` on the Profile Card reuses the existing top-up cancel path without altering the Wallet sub-menu.

**Blocked by:** 01 (service queries), 02 (menu button + command registered)

**Status:** done

- [x] `composer.command("account", ...)` and `composer.hears(["👤 حساب کاربری", ...], ...)` both route to the Profile Card handler in `BuyerComposer`.
- [x] Profile Card message contains Telegram ID, username, registration date, Available Balance, and order-status breakdown.
- [x] `INITIATED` Top-Up alert renders correct copy with no cancel button.
- [x] `PENDING` Top-Up alert renders correct copy with an inline cancel button; tapping it cancels the request.
- [x] `[📦 تاریخچه سفارش‌ها]` and `[💳 تاریخچه تراکنش‌ها]` buttons are always present on the Profile Card.
- [x] `tests/bot/buyer/account.test.ts` created, covering all of the above cases (mirrors `myorder.test.ts` pattern).
- [x] CI is green.
