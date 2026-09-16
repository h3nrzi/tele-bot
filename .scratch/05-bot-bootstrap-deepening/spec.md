Status: ready-for-agent

# Spec: Deepen the Bot Bootstrap Module

## Problem Statement

`bot.ts` is the single file responsible for assembling the grammY bot: it registers all conversations, resolves services from the DI container, mounts the buyer and admin composers, and sets the error boundary. At present the file contains 9 explicit conversation-factory imports, and adding any new conversation requires editing three separate blocks in the same file: the import list at the top, the service-resolution block in the middle, and the `bot.use(createConversation(…))` registration block. As the feature set grows, the file grows with it — the interface (`CreateBotOptions`) and the implementation stay nearly the same height, making the module shallow. The deletion test confirms this: deleting `bot.ts` concentrates no domain logic — it is pure wiring — but the wiring is harder to extend than it should be.

## Solution

Extract a `registerConversations(bot, container)` internal function. Conversation descriptors become a statically typed array of `{ id, factory }` entries; the function iterates the array and calls `bot.use(createConversation(factory, { id }))` for each entry. Adding a new conversation means appending one object to the array — no import-list editing, no scattered `bot.use()` call. `createBot`'s own body shrinks to four well-separated steps: (1) plugin and conversation registration via `registerConversations`, (2) admin and buyer composer mounting, (3) error boundary. The public `CreateBotOptions` interface and the returned `Bot<BotContext>` type are unchanged.

## User Stories

1. As a developer adding a new grammY conversation to the bot, I want to append one descriptor object to a typed array, so that I do not have to edit three separate code blocks to register a conversation.
2. As a developer reading `bot.ts`, I want the file to show four clearly separated steps (plugin setup, conversations, composers, error boundary), so that the assembly sequence is immediately legible.
3. As a developer, I want `createBot`'s public interface (`CreateBotOptions` and return type `Bot<BotContext>`) to remain unchanged after this refactor, so that all call sites — including every bot-layer test — continue to compile and pass with zero changes.
4. As a developer, I want conversation factory imports to be co-located with the descriptor array rather than scattered across the import block at the top of the file, so that the relationship between an import and its usage is local and obvious.
5. As a developer writing a test that calls `createBot({token, dbClient, adminIds, client, botInfo})`, I want the test to continue working without modification, so that the refactor is purely internal.
6. As a developer, I want the `registerConversations` function to be testable in isolation — given a mock bot and container, it should register exactly the expected set of conversation IDs — so that conversation registration is independently verifiable.
7. As a developer, I want the number and identity of registered conversations to be derivable from a single source of truth (the descriptor array), so that an audit of which conversations exist does not require reading the full function body of `createBot`.
8. As a developer, I want the refactored `bot.ts` to not import any service classes directly for the purpose of conversation wiring (services are resolved from the container inside `registerConversations`), so that adding a conversation does not add a new top-level import to `bot.ts`.
9. As a developer, I want the `createBot` function to remain the sole public export of the bot module, so that nothing in the call graph outside the `bot/` directory changes.

## Implementation Decisions

- **`registerConversations(bot, container)` function** — a module-private function defined in `bot.ts` (or extracted to a co-located `conversations.ts` file in `src/bot/`). It takes the `Bot<BotContext>` instance and the resolved `DependencyContainer`, and registers all conversations. It has no return value.

- **Descriptor array shape** — each entry is a plain object:

  ```ts
  {
  	id: string;
  	factory: (container: DependencyContainer) => ConversationFn;
  }
  ```

  The `factory` function receives the resolved container and returns the conversation handler function. Services needed by a conversation are resolved inside the factory from the container, not passed as top-level imports. This eliminates the need for `bot.ts` to import service classes for wiring purposes.

- **Conversation count** — all nine existing conversations are migrated to the descriptor array:
  - `SETRATE_CONVERSATION_ID` / `createSetRateConversation`
  - `SPREAD_CONVERSATION_ID` / `createSpreadConversation`
  - `SETCARD_CONVERSATION_ID` / `createSetCardConversation`
  - `TOPUP_CONVERSATION_ID` / `createTopUpConversation`
  - `REJECT_CONVERSATION_ID` / `createRejectConversation`
  - `ADD_CATALOG_ITEM_CONVERSATION_ID` / `createAddCatalogItemConversation`
  - `EDIT_CATALOG_ITEM_CONVERSATION_ID` / `createEditCatalogItemConversation`
  - `FULFIL_ORDER_CONVERSATION_ID` / `createFulfilOrderConversation`
  - `REJECT_ORDER_CONVERSATION_ID` / `createRejectOrderConversation`

- **`CreateBotOptions` interface** — unchanged. All existing fields (`token`, `container`, `dbClient`, `botInfo`, `adminIds`, `client`, `topUpLimits`) are preserved with the same types and optionality.

- **Service resolution inside factories** — each factory resolves only the services it needs from the container. The `TopUpLimits` value object (currently resolved with a fallback in `createBot`) is passed into factories that need it via a closure over the already-resolved `limits` local variable — no change to the limits-resolution logic.

- **`createBot` body after refactor** — four sequential steps, each clearly separated:
  1. Resolve or create the DI container and the `limits` value object (unchanged logic)
  2. Instantiate the `Bot<BotContext>` instance (unchanged)
  3. Call `bot.use(conversations())` then `registerConversations(bot, appContainer)` (new call replacing 9 individual `bot.use(createConversation(…))` calls)
  4. Mount `createBuyerComposer` and `createAdminComposer` (unchanged)
  5. Set the error boundary (unchanged)

- **No changes to conversation factory function signatures** — `createSetRateConversation(exchangeRateService, exchangeRateConfigService)` etc. keep their existing signatures. The descriptor array's factory wrapper is the only new indirection.

- **No changes to composers** — `createBuyerComposer` and `createAdminComposer` are mounted identically to today.

- **No schema, no DI token, no module registration changes.**

- **OTC Purchase notifier wiring** — the `TelegramOtcPurchaseNotifier` construction and `setNotifier` call that currently sits between service resolution and conversation registration in `bot.ts` is preserved in place for now. Cleaning it up is the subject of candidate 3 (out of scope for this spec).

## Testing Decisions

- **What makes a good test:** Call `createBot({token, dbClient, adminIds, client, botInfo})` and assert that the returned bot handles a given update correctly (command, callback query, conversation step). Do not test the internals of `registerConversations` via `bot.ts`'s private surface — test its effect by sending an update that would enter a conversation.

- **Modules to test:**
  - `createBot` — all existing bot-layer tests in `tests/bot/admin/` and `tests/bot/buyer/` are the primary regression suite. They must pass unchanged after the refactor; no test modifications are expected.
  - `registerConversations` (optional isolation test) — if extracted to its own file, a single test that calls it with a mock bot and verifies that `bot.use` was called the expected number of times and with the expected conversation IDs.

- **Prior art:** Every file in `tests/bot/admin/` and `tests/bot/buyer/` follows the same pattern: `createBot({token, dbClient, adminIds, client: {fetch: mockFetch}, botInfo})` then `bot.handleUpdate(update)`. This pattern must continue to work unmodified. The `container.test.ts` in `tests/core/di/` is prior art for testing DI wiring in isolation.

## Out of Scope

- Changing `createBuyerComposer` or `createAdminComposer`.
- Changing any conversation factory function (`createFulfilOrderConversation`, etc.).
- Changing `CreateBotOptions` or the return type of `createBot`.
- The OTC Purchase notifier mutable-setter cleanup (candidate 3 from the architecture review).
- The Order lifecycle notifier deepening (candidate 1, tracked separately in `.scratch/order-lifecycle-deepening/spec.md`).
- Moving conversations to lazy imports or dynamic registration.
- Any change to test files.

## Further Notes

- The primary win is **leverage**: the cost of adding a conversation drops from O(3 edits in 3 blocks) to O(1 object appended to 1 array). The secondary win is **locality**: the relationship between a conversation ID and its factory is declared in one place.
- If `registerConversations` is extracted to `src/bot/conversations.ts`, it becomes independently importable and testable without pulling in the full `createBot` factory — this is the preferred extraction point.
- The `TopUpLimits.fromEnv()` fallback logic near the top of `createBot` should not be moved or changed; it pre-dates this refactor and has subtleties around test environments.
