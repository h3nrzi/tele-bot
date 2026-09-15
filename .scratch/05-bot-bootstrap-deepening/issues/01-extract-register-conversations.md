# 01: Extract `registerConversations` to `src/bot/conversations.ts`

**What to build:** A new file `src/bot/conversations.ts` that owns all conversation registration logic. It exports a `registerConversations(bot, container, limits)` function that holds a statically-typed descriptor array of `{ id, factory }` entries — one per conversation — and iterates the array to call `bot.use(createConversation(factory(container, limits), { id }))` for each entry. All nine conversation-factory imports move from `bot.ts` into this file. The function compiles cleanly; `bot.ts` is not changed in this ticket.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] `src/bot/conversations.ts` exists and exports `registerConversations`
- [x] The descriptor array contains exactly nine entries, one for each existing conversation (`setRate`, `spread`, `setCard`, `topUp`, `reject`, `addCatalogItem`, `editCatalogItem`, `fulfilOrder`, `rejectOrder`)
- [x] Each entry's `factory` resolves its required services from `container` (and accepts `limits` via closure/param for conversations that need `TopUpLimits`)
- [x] All nine conversation-factory imports are co-located in `conversations.ts`, not in `bot.ts`
- [x] TypeScript compiles with no errors (`tsc --noEmit` passes)
