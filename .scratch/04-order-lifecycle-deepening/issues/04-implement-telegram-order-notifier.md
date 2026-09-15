# 04: Implement `TelegramOrderNotifier` and wire it in `bot.ts`

**What to build:** The real Telegram adapter that implements `IOrderNotifier`. It uses `bot.api` and the admin IDs set, both injected at construction. `onOrderPlaced` sends Admin Order Notification push messages to each admin and persists `order_admin_notifications` rows via `orderRepo.createAdminNotifications`. The other four methods edit Admin Order Notification keyboards to the appropriate layout using the existing `editAdminOrderNotificationMessages` helper from `order.keyboards.ts` and the buyer keyboard builders from `buyer/order.keyboards.ts`. All private context shapes (previously `*NotificationContext` in `order.dto.ts`) are defined as module-local types in this file. Registered in the DI container before `OrderService` is resolved, following the `TelegramOtcPurchaseNotifier` pattern.

**Blocked by:** 03 — `OrderService` must accept `IOrderNotifier` before the adapter can be wired in.

**Status:** ready-for-agent

- [ ] Create `src/bot/handlers/admin/order.notifier.ts` exporting `TelegramOrderNotifier implements IOrderNotifier`.
- [ ] Constructor accepts `Bot<BotContext>` (or `Api`) and the admin IDs collection; re-uses existing keyboard builders — no new keyboard layouts introduced.
- [ ] `onOrderPlaced` sends Telegram push messages to each admin and calls `orderRepo.createAdminNotifications` to persist rows.
- [ ] `onOrderClaimed`, `onOrderFulfilled`, `onOrderRejected`, `onOrderCancelled` call the appropriate keyboard-edit helpers for each `OrderAdminNotification` in context.
- [ ] Register `TelegramOrderNotifier` in the DI container using `TOKENS.OrderNotifier`, constructed after the bot is created so `bot.api` is available, before `OrderService` is resolved.
- [ ] Write isolated unit tests with a mock `Api` verifying message text and keyboard output per event.
- [ ] TypeScript compiles cleanly; unit tests pass.
