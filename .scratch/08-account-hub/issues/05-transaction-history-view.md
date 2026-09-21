# 05: Transaction History view

**What to build:** When a Buyer taps `[💳 تاریخچه تراکنش‌ها]` on the Profile Card, the message is edited in place to show a summary of their recent wallet ledger events.

The Transaction History view:

- Shows up to 5 most recent `BUYER_WALLET` Ledger Entries, joined with their parent Ledger Transaction's `narrative`.
- Each entry renders as: `➕/➖ <narrative>: +/-$<amount> | <date>` (CREDIT = `➕`, DEBIT = `➖`).
- Shows an empty-state message if the Buyer has no ledger history.
- Always shows `[🔙 بازگشت به پروفایل]`, which re-renders the Profile Card.

**Blocked by:** 01 (needs `getRecentWalletTransactions`), 03 (Profile Card must exist as the entry point)

**Status:** done

- [x] `account:transactions` callback handler edits the message to the transaction history view.
- [x] Up to 5 entries are shown in descending date order.
- [x] Each entry displays the correct credit/debit indicator, narrative, USD amount, and date.
- [x] Empty-state message shown when the Buyer has no ledger history.
- [x] `[🔙 بازگشت به پروفایل]` re-renders the Profile Card correctly.
- [x] `account.test.ts` extended to cover all of the above.
- [x] CI is green.
