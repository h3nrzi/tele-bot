# 02: Main-menu keyboard swap + `/account` command registration

**What to build:** Reorganise the Buyer's top-level keyboard and command list so the new Account Hub entry point exists. No handler logic is wired yet — this ticket is purely structural plumbing.

- `getBuyerMainMenuKeyboard()` in `menu.keyboards.ts` replaces the `📦 آخرین سفارش` button with `👤 حساب کاربری`. Button count stays at 3.
- The wallet button icon is updated from `💰` to `💳` (label and all existing `hears` patterns are unchanged).
- `/account` is added to `BUYER_BOT_COMMANDS` with an appropriate Persian description.
- The `hears` handler for `📦 آخرین سفارش` and related aliases is removed from `BuyerComposer` (since that button no longer appears in the menu). The underlying `/myorder` command handler is left in place for backward compatibility.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] `getBuyerMainMenuKeyboard()` emits `👤 حساب کاربری` and `💳 مدیریت کیف پول`; button count is still 3.
- [x] `/account` appears in `BUYER_BOT_COMMANDS`.
- [x] All existing wallet `hears` patterns still route correctly.
- [x] The old `📦 آخرین سفارش` `hears` block is removed.
- [x] Keyboard snapshot / command-list tests pass; CI is green.
