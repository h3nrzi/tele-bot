# 02: Wire `registerConversations` into `createBot`

**What to build:** `bot.ts` imports `registerConversations` from `./conversations` and calls it in place of the nine individual `bot.use(createConversation(…))` calls. The seven now-redundant service-class imports (`BankAccountService`, `TopUpService`, `BuyerService`, `CatalogService`, `OrderService`, `ExchangeRateService`, `ExchangeRateConfigService`) and all nine conversation-factory imports are removed from `bot.ts`. The resulting `createBot` body reads as four clearly-separated steps: (1) container and limits setup, (2) bot instance creation, (3) plugin + conversation registration via `registerConversations`, (4) composer mounting and error boundary. The public `CreateBotOptions` interface and `Bot<BotContext>` return type are unchanged. All existing bot-layer tests in `tests/bot/admin/` and `tests/bot/buyer/` pass with zero modification.

**Blocked by:** 01 — Extract `registerConversations` to `src/bot/conversations.ts`

**Status:** ready-for-agent

- [ ] `bot.ts` calls `bot.use(conversations())` then `registerConversations(bot, appContainer, limits)` in place of the nine scattered `bot.use(createConversation(…))` calls
- [ ] All nine conversation-factory imports are removed from `bot.ts`
- [ ] All seven service-class imports that were only used for conversation wiring are removed from `bot.ts`
- [ ] `CreateBotOptions` interface is unchanged (same fields, same types, same optionality)
- [ ] Return type of `createBot` is still `Bot<BotContext>`
- [ ] TypeScript compiles with no errors (`tsc --noEmit` passes)
- [ ] All existing bot-layer tests pass unmodified (`vitest run tests/bot/`)
