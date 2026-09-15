# 03: Isolation test for `registerConversations`

**What to build:** A single test file `tests/bot/conversations.test.ts` that calls `registerConversations` directly with a mock bot and a mock container, then asserts that `bot.use` was called exactly nine times and with handlers bearing the nine expected conversation IDs. This makes the descriptor array the single auditable source of truth for which conversations are registered, without needing to read `createBot`'s body.

**Blocked by:** 01 — Extract `registerConversations` to `src/bot/conversations.ts`

**Status:** ready-for-agent

- [ ] `tests/bot/conversations.test.ts` exists
- [ ] Test constructs a mock bot (spy on `bot.use`) and a minimal mock container that stubs the service resolutions used by each factory
- [ ] Test calls `registerConversations(mockBot, mockContainer, limits)` and asserts `bot.use` was called exactly nine times
- [ ] Test asserts each call received a handler whose conversation ID matches one of the nine expected IDs
- [ ] Test passes (`vitest run tests/bot/conversations.test.ts`)
- [ ] No existing test files are modified
