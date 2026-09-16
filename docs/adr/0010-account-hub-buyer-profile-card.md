# Account Hub: Additive Profile Card with Inline Order & Transaction History

We added an Account Hub (`👤 حساب کاربری`) as a third top-level main-menu button, replacing the standalone "Last Order" button. The hub lands on a Profile Card — a single Telegram message showing Buyer identity, Available Balance, an order-status breakdown, and a contextual Top-Up alert — with inline buttons drilling into a 5-order history and a 5-entry transaction history. The Wallet sub-menu (`💳 مدیریت کیف پول`) was kept fully intact; the Account Hub is additive, not a replacement.

## Considered Options

**Option A — Merge wallet flows into the hub.** Remove or trim the Wallet sub-menu and centralise all balance/top-up paths inside the Account Hub. Rejected because it would break the muscle memory of existing Buyers who rely on the Wallet sub-menu paths and would make `/topup`, `/cancel`, and `/status` feel orphaned without a keyboard anchor.

**Option B — Simple profile command only.** Add `/account` that shows static identity info only, without order or transaction history. Rejected because it would not address the core request to reduce main-menu clutter (the "Last Order" button would have stayed) and would add a command with little utility.

**Option C (chosen) — Additive hub with inline drill-in.** New `👤 حساب کاربری` button replaces `📦 آخرین سفارش` (keeping the menu at 3 buttons). Profile Card uses the existing Reply Keyboard as-is and renders history via inline buttons, avoiding a new sub-menu layer. Wallet sub-menu untouched.

## Consequences

- `/myorder` now renders the 5-order history instead of the single latest order. The command name no longer matches its singular form; this is a deliberate trade-off for backward compatibility — removing the command would break any deep-link or saved command shortcut Buyers have.
- Three new service methods are required (`getRecentOrdersForBuyer`, `getOrderCountBreakdown`, `getRecentWalletTransactions`) but no schema changes are needed.
- The Top-Up alert distinguishes `INITIATED` from `PENDING` with distinct copy, making the Profile Card the only place in the bot that renders both non-terminal Top-Up states simultaneously.
