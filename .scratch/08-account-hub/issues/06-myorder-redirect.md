# 06: `/myorder` redirect + `myorder.test.ts` update

**What to build:** Point `/myorder` (and its existing `hears` patterns) at the 5-order history list view that Ticket 04 built, giving saved command shortcuts richer information. Update the existing test file to match the new expected output.

- The `/myorder` command handler and its `hears` aliases in `BuyerComposer` are redirected to the same Account Hub Order History view (`account:orders`-equivalent render), showing up to 5 recent orders as inline buttons.
- `handleMyOrderCommand` (single-order view) is no longer called from the command entry point; it may be retired or kept as a dead-code cleanup in this ticket.
- `/myorder` remains listed in `BUYER_BOT_COMMANDS` (description may be updated to reflect the richer history).
- `tests/bot/buyer/myorder.test.ts` is updated: assertions now expect the list view rather than a single last-order message. Existing cancel-callback tests remain valid (the `order:cancel:<orderId>` callback data format is unchanged).

**Blocked by:** 04 (the 5-order history view must exist before `/myorder` can point at it)

**Status:** ready-for-agent

- [ ] `/myorder` command renders the 5-order history list, not a single-order message.
- [ ] All existing `hears` aliases for `/myorder` also render the history list.
- [ ] `myorder.test.ts` updated; all assertions pass against the new list view.
- [ ] Existing cancel-callback tests in `myorder.test.ts` are unaffected.
- [ ] CI is green.
