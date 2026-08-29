# 📖 Lesson 08: Interactive Bot Conversations, Handlers & Composers

In this lesson, you will build the interactive Telegram experience using **grammY Conversations** and **Composers**, connecting the Telegram interface to the underlying domain services.

---

## 🎯 Learning Objectives
1. Implement multi-step wizard dialogues with `@grammyjs/conversations`.
2. Build the **Top-Up Conversation** (amount input, real-time IRR calculation, bank account display, expiry countdown).
3. Build the **Receipt Photo Listener**, transitioning requests to `PENDING` and broadcasting the receipt with inline action buttons to all Admins.
4. Implement the **Admin Approval Callback Handler**, executing the atomic double-entry approval workflow upon button click.
5. Structure handlers into dedicated `BuyerComposer` and `AdminComposer` modules.

---

## 💡 Conversation & Update Flow

```
Buyer sends /topup
       |
       v
+-----------------------------+
|    top-up.conversation      |
| 1. Ask for USD amount       |
| 2. Validate against limits  |
| 3. Fetch active exchange    |
|    rate and calculate IRR   |
| 4. Fetch active bank card   |
| 5. Create INITIATED request |
| 6. Show payment instructions|
+--------------+--------------+
               |
    Buyer uploads Receipt photo
               |
               v
+-----------------------------+
|    receipt.handler.ts       |
| 1. Find INITIATED request   |
| 2. Save Telegram file_id    |
| 3. Move status -> PENDING   |
| 4. Forward photo + caption  |
|    to all Admins with       |
|    [Approve] [Reject] keys  |
+--------------+--------------+
               |
    Admin clicks [Approve]
               |
               v
+-----------------------------+
|    approve.handler.ts       |
| 1. Call TopUpService.approve|
| 2. Ledger credited atomically|
| 3. Edit Admin message       |
| 4. Push notice to Buyer     |
+-----------------------------+
```

---

## 🛠️ Step-by-Step Implementation

### Step 1: Top-Up Conversation (`src/bot/handlers/buyer/top-up.conversation.ts`)

```typescript
import type { Conversation } from '@grammyjs/conversations';
import type { BotContext } from '@/bot/context';
import type { TopUpService } from '@/modules/top-up/top-up.service';
import type { BuyerService } from '@/modules/buyer/buyer.service';
import type { BankAccountService } from '@/modules/bank-account/bank-account.service';
import type { TopUpLimits } from '@/modules/top-up/top-up.limits.vo';
import { formatToman, formatIrr } from '@/core/shared/currency.utils';

export const TOPUP_CONVERSATION_ID = 'topup-conversation';

export function createTopUpConversation(
  topUpService: TopUpService,
  buyerService: BuyerService,
  bankAccountService: BankAccountService,
  limits?: TopUpLimits
) {
  return async function topUpConversation(
    conversation: Conversation<BotContext>,
    ctx: BotContext
  ): Promise<void> {
    const chatId = ctx.from?.id;
    if (!chatId) return;

    // 1. Ensure Buyer & Bank Account exist
    const activeBank = await conversation.external(() => bankAccountService.getActiveAccount());
    if (!activeBank) {
      await ctx.reply('⚠️ Top-up is temporarily disabled: No active bank account destination configured.');
      return;
    }

    // 2. Prompt for USD Amount
    await ctx.reply('💵 Please enter the amount in USD ($) you wish to top up:');
    const responseCtx = await conversation.waitFor(':text');
    const text = responseCtx.message?.text?.trim();

    // 3. Initiate Top-Up Request
    try {
      const result = await conversation.external(() =>
        topUpService.initiateTopUp(
          {
            telegramChatId: BigInt(chatId),
            usdAmount: text ?? '',
          },
          limits
        )
      );

      const toman = formatToman(result.request.irrAmount);
      const rial = formatIrr(result.request.irrAmount);

      await ctx.reply(
        `✅ *Top-Up Request Initiated!*\n\n` +
          `💰 *Amount:* ${result.request.usdAmount.format()}\n` +
          `📈 *Rate:* ${formatIrr(result.exchangeRate.irrPerUsd)} IRR / USD\n` +
          `💳 *Total Payable:* ${toman} (${rial} Rials)\n\n` +
          `🏦 *Transfer To:*\n` +
          `• Card: \`${activeBank.cardNumber}\`\n` +
          `• Holder: *${activeBank.cardHolderName}*\n` +
          `• Bank: *${activeBank.bankName}*\n\n` +
          `⏱ Please transfer within *30 minutes* and upload the payment receipt photo here.`,
        { parse_mode: 'Markdown' }
      );
    } catch (err: any) {
      await ctx.reply(`❌ ${err.message || 'Failed to initiate top-up.'}`);
    }
  };
}
```

---

### Step 2: Receipt Photo Handler (`src/bot/handlers/buyer/receipt.handler.ts`)

When a Buyer sends a photo message, verify if they have an active `INITIATED` top-up and transition it to `PENDING`:

```typescript
import type { BotContext } from '@/bot/context';
import type { TopUpService } from '@/modules/top-up/top-up.service';
import { parseAdminIds } from '@/bot/middleware/admin.middleware';
import { createApprovalInlineKeyboard } from '@/bot/handlers/admin/approval.keyboards';
import { formatToman } from '@/core/shared/currency.utils';

export function createReceiptPhotoHandler(topUpService: TopUpService, adminIdsInput?: string | Set<bigint>) {
  const adminIds = parseAdminIds(adminIdsInput);

  return async function handlePhotoMessage(ctx: BotContext): Promise<void> {
    const chatId = ctx.from?.id;
    const photos = ctx.message?.photo;
    if (!chatId || !photos || photos.length === 0) return;

    // Largest photo is always the last element
    const largestPhoto = photos[photos.length - 1];
    const caption = ctx.message?.caption;

    try {
      const { request } = await topUpService.submitReceipt({
        telegramChatId: BigInt(chatId),
        receiptFileId: largestPhoto.file_id,
        receiptCaption: caption,
      });

      await ctx.reply(
        '📨 *Receipt received!*\nYour payment is now under review by our operators. You will be notified once approved.',
        { parse_mode: 'Markdown' }
      );

      // Broadcast receipt to all configured Admins
      for (const adminId of adminIds) {
        try {
          await ctx.api.sendPhoto(Number(adminId), largestPhoto.file_id, {
            caption:
              `🔔 *New Pending Top-Up Request*\n\n` +
              `👤 Buyer: \`${chatId}\`\n` +
              `💰 Amount: ${request.usdAmount.format()}\n` +
              `💳 Expected IRR: ${formatToman(request.irrAmount)}\n` +
              (caption ? `📝 Note: ${caption}\n` : ''),
            parse_mode: 'Markdown',
            reply_markup: createApprovalInlineKeyboard(request.id),
          });
        } catch (err) {
          console.error(`Failed to notify admin ${adminId}:`, err);
        }
      }
    } catch (err: any) {
      await ctx.reply(`❌ ${err.message || 'Could not process receipt.'}`);
    }
  };
}
```

---

### Step 3: Admin Approval Callback (`src/bot/handlers/admin/approve.handler.ts`)

```typescript
import type { BotContext } from '@/bot/context';
import type { TopUpService } from '@/modules/top-up/top-up.service';

export function createApprovalCallbackHandler(topUpService: TopUpService) {
  return async function handleApproveCallback(ctx: BotContext): Promise<void> {
    const callbackData = ctx.callbackQuery?.data;
    if (!callbackData || !callbackData.startsWith('admin:approve:')) return;

    const topUpRequestId = callbackData.replace('admin:approve:', '');
    const adminId = ctx.from?.id;
    if (!adminId) return;

    await ctx.answerCallbackQuery({ text: 'Processing approval...' });

    try {
      const result = await topUpService.approveTopUp(
        {
          topUpRequestId,
          adminTelegramId: BigInt(adminId),
        },
        {
          notifyBuyer: async ({ buyerTelegramChatId, creditedUsdAmount, newAvailableBalance }) => {
            await ctx.api.sendMessage(
              Number(buyerTelegramChatId),
              `🎉 *Top-Up Approved!*\n\n` +
                `Your wallet has been credited with *+$${creditedUsdAmount}*.\n` +
                `💰 *New Available Balance:* ${newAvailableBalance.format()}`,
              { parse_mode: 'Markdown' }
            );
          },
        }
      );

      // Edit admin review message to show completed badge
      await ctx.editMessageCaption({
        caption:
          (ctx.callbackQuery?.message?.caption ?? '') +
          `\n\n✅ *APPROVED* by Admin \`${adminId}\``,
        parse_mode: 'Markdown',
      });
    } catch (err: any) {
      await ctx.reply(`❌ Approval failed: ${err.message}`);
    }
  };
}
```

---

## 🧪 Verification & Testing

Run the full bot testing suite covering all buyer and admin flows:
```bash
npx vitest run tests/bot/
```

Expected output:
```
✓ tests/bot/buyer/start.test.ts (6 tests)
✓ tests/bot/buyer/topup.test.ts (7 tests)
✓ tests/bot/buyer/balance.test.ts (5 tests)
✓ tests/bot/buyer/status.test.ts (6 tests)
✓ tests/bot/buyer/cancel.test.ts (6 tests)
✓ tests/bot/buyer/receipt.test.ts (5 tests)
✓ tests/bot/admin/approve.test.ts (4 tests)
✓ tests/bot/admin/reject.test.ts (7 tests)
✓ tests/bot/admin/set-rate.test.ts (10 tests)
✓ tests/bot/admin/rate.test.ts (7 tests)
✓ tests/bot/admin/pending.test.ts (4 tests)
✓ tests/bot/admin/set-card.test.ts (7 tests)
```

---

## 🚀 Next Step
Proceed to [**Lesson 09: Application Bootstrap, Test Harness & Deployment**](file:///Users/hossein/Projects/tele-bot/learning/09-application-bootstrap-and-testing/README.md).
