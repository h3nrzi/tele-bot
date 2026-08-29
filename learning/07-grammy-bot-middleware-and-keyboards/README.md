# 📖 Lesson 07: Telegram Bot Setup, Admin Middleware & Keyboards

In this lesson, you will build the presentation foundations of the Telegram bot using **grammY**: custom context typing, admin authorization middleware, dynamic keyboards, and scoped command menus.

---

## 🎯 Learning Objectives
1. Define a custom, type-safe **`BotContext`** integrating session state, conversations, and dependency injection.
2. Implement **Admin Authorization Middleware** to restrict privileged commands (`/pending`, `/setrate`, `/setcard`) strictly to configured `ADMIN_IDS`.
3. Create interactive **Inline Keyboards** for admin review actions (Approve, Reject, Quick Rejection Reasons, Pagination).
4. Create persistent **Reply Keyboards** for quick Buyer navigation.
5. Register scoped Telegram bot commands with `setMyCommands`.

---

## 💡 Architecture & Security Flow

```
                      Telegram Incoming Update
                                 |
                                 v
                     +-----------------------+
                     |  Custom BotContext    |
                     +-----------+-----------+
                                 |
                                 v
                   Is route an Admin Handler?
                               /   \
                             Yes    No
                             /        \
                            v          v
            +----------------------+  +---------------------+
            |   Admin Middleware   |  |   Buyer Composer    |
            +-----------+----------+  +---------------------+
                        |
            Is ctx.from.id in ADMIN_IDS?
                      /   \
                    Yes    No
                    /        \
                   v          v
+---------------------+   +------------------------------------+
| Execute Admin Action|   | Drop update / Reply "Unauthorized" |
+---------------------+   +------------------------------------+
```

---

## 🛠️ Step-by-Step Implementation

### Step 1: Custom Bot Context (`src/bot/context.ts`)

```typescript
import { Context, SessionFlavor } from 'grammy';
import { ConversationFlavor } from '@grammyjs/conversations';
import type { DependencyContainer } from 'tsyringe';

export interface SessionData {
  // Ephemeral session data
}

export type BotContext = Context &
  SessionFlavor<SessionData> &
  ConversationFlavor & {
    container?: DependencyContainer;
  };
```

---

### Step 2: Admin Middleware (`src/bot/middleware/admin.middleware.ts`)

```typescript
import { MiddlewareFn } from 'grammy';
import type { BotContext } from '@/bot/context';
import { normalizeChatId } from '@/core/shared/telegram.utils';

export function parseAdminIds(adminIds?: string | Set<bigint>): Set<bigint> {
  if (adminIds instanceof Set) {
    return adminIds;
  }

  const raw = adminIds ?? process.env.ADMIN_IDS ?? '';
  const set = new Set<bigint>();

  raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((idStr) => {
      try {
        set.add(BigInt(idStr));
      } catch {
        // Skip malformed IDs
      }
    });

  return set;
}

export function createAdminMiddleware(
  configuredAdminIds?: string | Set<bigint>
): MiddlewareFn<BotContext> {
  const adminIds = parseAdminIds(configuredAdminIds);

  return async (ctx, next) => {
    const fromId = ctx.from?.id;
    if (!fromId) {
      return; // Ignore updates without sender
    }

    const senderBigInt = normalizeChatId(fromId);
    if (!adminIds.has(senderBigInt)) {
      if (ctx.callbackQuery) {
        await ctx.answerCallbackQuery({
          text: '⛔ Access denied. Admin privileges required.',
          show_alert: true,
        });
      } else if (ctx.message) {
        await ctx.reply('⛔ You do not have permission to use admin commands.');
      }
      return;
    }

    return await next();
  };
}
```

---

### Step 3: Keyboards

#### 1. Buyer Menu Keyboard (`src/bot/keyboards/menu.keyboards.ts`):
```typescript
import { Keyboard } from 'grammy';

export function getMainMenuKeyboard(): Keyboard {
  return new Keyboard()
    .text('💳 Top-Up Wallet')
    .text('💰 Available Balance')
    .row()
    .text('📊 Top-Up Status')
    .text('❌ Cancel Active Request')
    .resized();
}
```

#### 2. Admin Approval Inline Keyboard (`src/bot/handlers/admin/approval.keyboards.ts`):
```typescript
import { InlineKeyboard } from 'grammy';

export function createApprovalInlineKeyboard(topUpRequestId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Approve Top-Up', `admin:approve:${topUpRequestId}`)
    .text('❌ Reject', `admin:reject:${topUpRequestId}`);
}
```

#### 3. Quick Rejection Reasons Keyboard (`src/bot/handlers/admin/rejection.keyboards.ts`):
```typescript
import { InlineKeyboard } from 'grammy';

export function createRejectionReasonsKeyboard(topUpRequestId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('🚫 Fake / Invalid Receipt', `admin:reject_reason:${topUpRequestId}:invalid_receipt`)
    .row()
    .text('📉 Incorrect Transfer Amount', `admin:reject_reason:${topUpRequestId}:amount_mismatch`)
    .row()
    .text('🔄 Duplicate Submission', `admin:reject_reason:${topUpRequestId}:duplicate`)
    .row()
    .text('✏️ Custom Reason...', `admin:reject_reason:${topUpRequestId}:custom`)
    .row()
    .text('🔙 Back to Pending', 'admin:pending:1');
}
```

---

### Step 4: Bot Commands Setup (`src/bot/commands/bot-commands.ts`)

```typescript
import type { Api } from 'grammy';
import { parseAdminIds } from '@/bot/middleware/admin.middleware';

export async function setupBotCommands(
  api: Api,
  adminIdsInput?: string | Set<bigint>
): Promise<void> {
  // 1. Default commands for all Buyers
  await api.setMyCommands([
    { command: 'start', description: 'Start the bot and open main menu' },
    { command: 'topup', description: 'Initiate a new wallet top-up' },
    { command: 'balance', description: 'View your current available USD balance' },
    { command: 'status', description: 'Check status of active top-up request' },
    { command: 'cancel', description: 'Cancel your current in-flight top-up' },
  ]);

  // 2. Scoped admin commands per Admin chat ID
  const adminIds = parseAdminIds(adminIdsInput);
  for (const adminId of adminIds) {
    try {
      await api.setMyCommands(
        [
          { command: 'pending', description: 'Review pending top-up requests' },
          { command: 'rate', description: 'View current USD/IRR exchange rate' },
          { command: 'setrate', description: 'Update USD/IRR exchange rate' },
          { command: 'setcard', description: 'Configure active destination bank card' },
          { command: 'start', description: 'Open main menu' },
        ],
        { scope: { type: 'chat', chat_id: Number(adminId) } }
      );
    } catch {
      // Chat might not be initialized yet
    }
  }
}
```

---

## 🧪 Verification & Testing

Run tests for middleware and keyboards:
```bash
npx vitest run tests/bot/middleware/ tests/bot/keyboards/
```

Expected output:
```
✓ tests/bot/middleware/admin.middleware.test.ts (13 tests)
✓ tests/bot/keyboards/menu.test.ts (9 tests)
```

---

## 🚀 Next Step
Proceed to [**Lesson 08: Interactive Bot Conversations, Handlers & Composers**](file:///Users/hossein/Projects/tele-bot/learning/08-conversations-and-handlers/README.md).
