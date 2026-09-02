import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { createMockFetch } from '@tests/helpers/mock-context';
import { createBot } from '@/bot/bot';
import {
  createTestBuyer,
  createTestCatalogItem,
  placeTestOrder,
  claimTestOrder,
} from '@tests/helpers/fixtures';
import { wallets } from '@/modules/wallet/wallet.schema';
import {
  orders,
  ledgerTransactions,
  orderAdminNotifications,
} from '@/core/database/schema';
import { eq } from 'drizzle-orm';
import { buildMyOrderView } from '@/bot/handlers/buyer/order.keyboards';

describe('Buyer /myorder Command & Order Cancellation Flow (Ticket 08)', () => {
  const { db, container } = setupTestDatabase();
  const buyerChatId = 987654321;
  const adminChatId = 123456789;
  const originalEnv = process.env.ADMIN_IDS;

  beforeEach(() => {
    process.env.ADMIN_IDS = `${adminChatId}`;
  });

  afterEach(() => {
    process.env.ADMIN_IDS = originalEnv;
  });

  function makeMessageUpdate(
    updateId: number,
    chatId: number,
    text: string,
    senderName = 'Buyer',
    username = 'buyer_user'
  ) {
    const isCommand = text.startsWith('/');
    const commandLength = text.indexOf(' ') > 0 ? text.indexOf(' ') : text.length;

    const message: Record<string, unknown> = {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: 'private', first_name: senderName },
      from: { id: chatId, is_bot: false, first_name: senderName, username },
      text,
    };

    if (isCommand) {
      message.entities = [
        {
          offset: 0,
          length: commandLength,
          type: 'bot_command',
        },
      ];
    }

    return {
      update_id: updateId,
      message,
    } as any;
  }

  function makeCallbackQueryUpdate(
    updateId: number,
    chatId: number,
    data: string,
    messageId = 1,
    senderName = 'Buyer',
    username = 'buyer_user'
  ) {
    return {
      update_id: updateId,
      callback_query: {
        id: `cb_${updateId}`,
        from: { id: chatId, is_bot: false, first_name: senderName, username },
        message: {
          message_id: messageId,
          date: Math.floor(Date.now() / 1000),
          chat: { id: chatId, type: 'private', first_name: senderName },
          text: '📦 وضعیت آخرین سفارش',
        },
        chat_instance: 'test_instance',
        data,
      },
    } as any;
  }

  function createTestBot() {
    const repliedMessages: string[] = [];
    const editedMessages: any[] = [];
    const answeredCallbackQueries: any[] = [];
    const sentMessages: any[] = [];
    const { fetch: mockFetch } = createMockFetch(
      repliedMessages,
      [],
      editedMessages,
      answeredCallbackQueries,
      sentMessages
    );
    const bot = createBot({
      token: 'test_token',
      dbClient: db,
      adminIds: `${adminChatId}`,
      client: {
        fetch: mockFetch,
      },
      botInfo: {
        id: 1000,
        is_bot: true,
        first_name: 'TeleBot',
        username: 'tele_bot',
        can_join_groups: true,
        can_read_all_group_messages: false,
        supports_inline_queries: false,
      } as any,
    });
    return {
      bot,
      repliedMessages,
      editedMessages,
      answeredCallbackQueries,
      sentMessages,
    };
  }

  describe('MyOrder View & Keyboard Unit Logic', () => {
    it('returns empty-state message when order is null', () => {
      const { messageText, keyboard, hasCancelButton } = buildMyOrderView(null, null);
      expect(messageText).toContain('شما تاکنون هیچ سفارشی ثبت نکرده‌اید');
      expect(hasCancelButton).toBe(false);
      expect(keyboard.inline_keyboard.flat()).toHaveLength(0);
    });

    it('renders order details and Cancel button when status is PLACED', () => {
      const order = {
        id: '12345678-1234-1234-1234-123456789abc',
        usdPriceSnapshot: '19.99',
        status: 'PLACED',
        createdAt: new Date(),
      } as any;

      const catalogItem = {
        id: 'cat-1',
        name: 'Telegram Premium 1 Year',
      } as any;

      const { messageText, keyboard, hasCancelButton } = buildMyOrderView(order, catalogItem);
      expect(messageText).toContain('Telegram Premium 1 Year');
      expect(messageText).toContain('$19.99');
      expect(messageText).toContain('ثبت شده');
      expect(hasCancelButton).toBe(true);

      const flatButtons = keyboard.inline_keyboard.flat() as any[];
      expect(flatButtons).toHaveLength(1);
      expect(flatButtons[0]?.text).toContain('لغو سفارش');
      expect(flatButtons[0]?.callback_data).toBe(`order:cancel:${order.id}`);
    });

    it('renders explanation notice and omits Cancel button when status is PROCESSING', () => {
      const order = {
        id: '12345678-1234-1234-1234-123456789abc',
        usdPriceSnapshot: '19.99',
        status: 'PROCESSING',
        createdAt: new Date(),
      } as any;

      const catalogItem = {
        id: 'cat-1',
        name: 'Telegram Premium 1 Year',
      } as any;

      const { messageText, keyboard, hasCancelButton } = buildMyOrderView(order, catalogItem);
      expect(messageText).toContain('Telegram Premium 1 Year');
      expect(messageText).toContain('امکان لغو آن وجود ندارد');
      expect(hasCancelButton).toBe(false);
      expect(keyboard.inline_keyboard.flat()).toHaveLength(0);
    });
  });

  describe('/myorder Command via bot.handleUpdate', () => {
    it('shows empty-state message when buyer has never placed an order', async () => {
      await createTestBuyer(container, {
        telegramChatId: buyerChatId,
        telegramUsername: 'buyer_user',
      });

      const { bot, repliedMessages } = createTestBot();

      await bot.handleUpdate(
        makeMessageUpdate(1, buyerChatId, '/myorder', 'Buyer')
      );

      expect(repliedMessages).toHaveLength(1);
      expect(repliedMessages[0]).toContain('هیچ سفارشی ثبت نکرده‌اید');
    });

    it('shows latest order details and Cancel button when status is PLACED', async () => {
      const { buyer, wallet } = await createTestBuyer(container, {
        telegramChatId: buyerChatId,
        telegramUsername: 'buyer_user',
      });

      await db
        .update(wallets)
        .set({ availableBalance: '50.00' })
        .where(eq(wallets.id, wallet.id));

      const item = await createTestCatalogItem(container, {
        name: 'Spotify Premium 1 Year',
        usdPrice: '14.99',
        isActive: true,
      });

      const { order } = await placeTestOrder(container, {
        userId: buyer.id,
        catalogItemId: item.id,
      });

      const { bot, repliedMessages } = createTestBot();

      await bot.handleUpdate(
        makeMessageUpdate(1, buyerChatId, '/myorder', 'Buyer')
      );

      expect(repliedMessages).toHaveLength(1);
      const text = repliedMessages[0];
      expect(text).toContain('Spotify Premium 1 Year');
      expect(text).toContain('$14.99');
      expect(text).toContain(order.id);
    });

    it('shows explanation notice when order is in PROCESSING status', async () => {
      const { buyer, wallet } = await createTestBuyer(container, {
        telegramChatId: buyerChatId,
        telegramUsername: 'buyer_user',
      });

      await db
        .update(wallets)
        .set({ availableBalance: '50.00' })
        .where(eq(wallets.id, wallet.id));

      const item = await createTestCatalogItem(container, {
        name: 'Netflix 1 Month',
        usdPrice: '12.00',
        isActive: true,
      });

      const { order } = await placeTestOrder(container, {
        userId: buyer.id,
        catalogItemId: item.id,
      });

      await claimTestOrder(container, {
        orderId: order.id,
        adminTelegramId: BigInt(adminChatId),
        adminUsername: 'admin_ops',
      });

      const { bot, repliedMessages } = createTestBot();

      await bot.handleUpdate(
        makeMessageUpdate(1, buyerChatId, '/myorder', 'Buyer')
      );

      expect(repliedMessages).toHaveLength(1);
      const text = repliedMessages[0];
      expect(text).toContain('Netflix 1 Month');
      expect(text).toContain('امکان لغو آن وجود ندارد');
    });

    it("responds to menu button '📦 آخرین سفارش'", async () => {
      const { buyer, wallet } = await createTestBuyer(container, {
        telegramChatId: buyerChatId,
        telegramUsername: 'buyer_user',
      });

      await db
        .update(wallets)
        .set({ availableBalance: '50.00' })
        .where(eq(wallets.id, wallet.id));

      const item = await createTestCatalogItem(container, {
        name: 'ExpressVPN 1 Year',
        usdPrice: '30.00',
        isActive: true,
      });

      await placeTestOrder(container, {
        userId: buyer.id,
        catalogItemId: item.id,
      });

      const { bot, repliedMessages } = createTestBot();

      await bot.handleUpdate(
        makeMessageUpdate(1, buyerChatId, '📦 آخرین سفارش', 'Buyer')
      );

      expect(repliedMessages).toHaveLength(1);
      expect(repliedMessages[0]).toContain('ExpressVPN 1 Year');
    });
  });

  describe('Order Cancellation Callback (order:cancel:<orderId>)', () => {
    it('cancels order, restores balance, links refund ledger, confirms to buyer, and edits admin notifications', async () => {
      const { buyer, wallet } = await createTestBuyer(container, {
        telegramChatId: buyerChatId,
        telegramUsername: 'buyer_user',
      });

      await db
        .update(wallets)
        .set({ availableBalance: '100.00' })
        .where(eq(wallets.id, wallet.id));

      const item = await createTestCatalogItem(container, {
        name: 'ChatGPT Plus 1 Month',
        usdPrice: '20.00',
        isActive: true,
      });

      const { order, ledgerTransaction: originalDebitTx } = await placeTestOrder(
        container,
        {
          userId: buyer.id,
          catalogItemId: item.id,
        },
        {
          notifyAdmins: async () => [
            {
              adminTelegramId: BigInt(adminChatId),
              chatId: BigInt(adminChatId),
              messageId: 8888n,
            },
          ],
        }
      );

      // Verify wallet balance is 80.00
      const [walletAfterPlacement] = await db
        .select()
        .from(wallets)
        .where(eq(wallets.id, wallet.id));
      expect(walletAfterPlacement?.availableBalance).toBe('80.00');

      const {
        bot,
        editedMessages,
        answeredCallbackQueries,
      } = createTestBot();

      // Buyer taps [❌ لغو سفارش]
      await bot.handleUpdate(
        makeCallbackQueryUpdate(
          1,
          buyerChatId,
          `order:cancel:${order.id}`,
          1,
          'Buyer',
          'buyer_user'
        )
      );

      // 1. Assert answered callback query
      expect(answeredCallbackQueries).toHaveLength(1);
      expect(answeredCallbackQueries[0]?.text).toContain('لغو شد');

      // 2. Assert buyer confirmation message
      const buyerConfirmation = editedMessages.find(
        (m) => Number(m.chat_id) === buyerChatId
      );
      expect(buyerConfirmation).toBeDefined();
      expect(buyerConfirmation?.text).toContain('با موفقیت لغو شد');
      expect(buyerConfirmation?.text).toContain('$20.00');
      expect(buyerConfirmation?.text).toContain('$100.00');

      // 3. Assert DB Order status updated to CANCELLED
      const [dbOrder] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, order.id));
      expect(dbOrder?.status).toBe('CANCELLED');
      expect(dbOrder?.cancelledAt).toBeInstanceOf(Date);

      // 4. Assert DB Wallet balance restored to 100.00
      const [dbWallet] = await db
        .select()
        .from(wallets)
        .where(eq(wallets.id, wallet.id));
      expect(dbWallet?.availableBalance).toBe('100.00');

      // 5. Assert original debit is linked to refund transaction
      const [originalDbTx] = await db
        .select()
        .from(ledgerTransactions)
        .where(eq(ledgerTransactions.id, originalDebitTx.id));
      expect(originalDbTx?.reversedByLedgerTransactionId).toBeDefined();
      expect(originalDbTx?.reversedByLedgerTransactionId).not.toBeNull();

      // 6. Assert admin notifications were edited
      const adminEdit = editedMessages.find(
        (m) => Number(m.chat_id) === adminChatId
      );
      expect(adminEdit).toBeDefined();
      const flatButtons =
        adminEdit?.reply_markup?.inline_keyboard?.flat() ?? [];
      expect(flatButtons).toHaveLength(1);
      expect(flatButtons[0]?.text).toContain('لغو شده توسط خریدار');
    });

    it('shows alert when buyer attempts to cancel an order already claimed by admin (PROCESSING)', async () => {
      const { buyer, wallet } = await createTestBuyer(container, {
        telegramChatId: buyerChatId,
        telegramUsername: 'buyer_user',
      });

      await db
        .update(wallets)
        .set({ availableBalance: '50.00' })
        .where(eq(wallets.id, wallet.id));

      const item = await createTestCatalogItem(container, {
        name: 'Item In Processing',
        usdPrice: '10.00',
        isActive: true,
      });

      const { order } = await placeTestOrder(container, {
        userId: buyer.id,
        catalogItemId: item.id,
      });

      // Admin claims the order
      await claimTestOrder(container, {
        orderId: order.id,
        adminTelegramId: BigInt(adminChatId),
        adminUsername: 'admin_ops',
      });

      const { bot, answeredCallbackQueries } = createTestBot();

      // Buyer tries to cancel
      await bot.handleUpdate(
        makeCallbackQueryUpdate(
          1,
          buyerChatId,
          `order:cancel:${order.id}`,
          1,
          'Buyer',
          'buyer_user'
        )
      );

      expect(answeredCallbackQueries).toHaveLength(1);
      expect(answeredCallbackQueries[0]?.show_alert).toBe(true);
      expect(answeredCallbackQueries[0]?.text).toContain('امکان لغو');

      // Status remains PROCESSING
      const [dbOrder] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, order.id));
      expect(dbOrder?.status).toBe('PROCESSING');
    });

    it('shows alert when non-owner buyer attempts to cancel someone else order', async () => {
      const { buyer: ownerBuyer, wallet: ownerWallet } = await createTestBuyer(
        container,
        {
          telegramChatId: buyerChatId,
          telegramUsername: 'owner_buyer',
        }
      );
      const otherChatId = 999111222;
      await createTestBuyer(container, {
        telegramChatId: otherChatId,
        telegramUsername: 'other_buyer',
      });

      await db
        .update(wallets)
        .set({ availableBalance: '50.00' })
        .where(eq(wallets.id, ownerWallet.id));

      const item = await createTestCatalogItem(container, {
        name: 'Test Item',
        usdPrice: '10.00',
        isActive: true,
      });

      const { order } = await placeTestOrder(container, {
        userId: ownerBuyer.id,
        catalogItemId: item.id,
      });

      const { bot, answeredCallbackQueries } = createTestBot();

      // other buyer tries to cancel owner's order
      await bot.handleUpdate(
        makeCallbackQueryUpdate(
          1,
          otherChatId,
          `order:cancel:${order.id}`,
          1,
          'Other',
          'other_buyer'
        )
      );

      expect(answeredCallbackQueries).toHaveLength(1);
      expect(answeredCallbackQueries[0]?.show_alert).toBe(true);
      expect(answeredCallbackQueries[0]?.text).toContain('دسترسی');

      // Status remains PLACED
      const [dbOrder] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, order.id));
      expect(dbOrder?.status).toBe('PLACED');
    });
  });
});
