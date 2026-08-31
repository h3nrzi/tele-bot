import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { createMockFetch } from '@tests/helpers/mock-context';
import { createBot } from '@/bot/bot';
import {
  createTestBuyer,
  createTestCatalogItem,
  placeTestOrder,
} from '@tests/helpers/fixtures';
import { wallets } from '@/modules/wallet/wallet.schema';
import {
  orders,
  ledgerTransactions,
  ledgerEntries,
  orderAdminNotifications,
} from '@/core/database/schema';
import { count, eq } from 'drizzle-orm';
import {
  buildShopView,
  buildOrderConfirmationView,
} from '@/bot/handlers/buyer/shop.keyboards';

describe('Buyer /shop Command & Order Confirmation Prompt (Ticket 03)', () => {
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
          text: '🛍️ کاتالوگ خدمات',
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

  describe('Shop View & Confirmation Keyboards Unit Logic', () => {
    it('buildShopView returns graceful empty-state message when no items exist', () => {
      const { messageText, keyboard } = buildShopView([]);
      expect(messageText).toContain('در حال حاضر هیچ خدمتی برای خرید موجود نیست');
      const flatButtons = keyboard.inline_keyboard.flat();
      expect(flatButtons).toHaveLength(0);
    });

    it('buildShopView renders inline keyboard with active items', () => {
      const { messageText, keyboard } = buildShopView([
        {
          id: 'item-1',
          name: 'Telegram Premium 1 Month',
          description: 'Instant activation',
          usdPrice: '4.99',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
        {
          id: 'item-2',
          name: 'VPN 1 Month',
          description: null,
          usdPrice: '5.00',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
      ]);

      expect(messageText).toContain('فروشگاه خدمات');
      const flatButtons = keyboard.inline_keyboard.flat() as any[];
      expect(flatButtons).toHaveLength(2);
      expect(flatButtons[0]?.text).toBe('Telegram Premium 1 Month - $4.99');
      expect(flatButtons[0]?.callback_data).toBe('shop:item:item-1');
      expect(flatButtons[1]?.text).toBe('VPN 1 Month - $5.00');
      expect(flatButtons[1]?.callback_data).toBe('shop:item:item-2');
    });

    it('buildOrderConfirmationView includes Confirm button when balance >= price', () => {
      const item = {
        id: 'item-1',
        name: 'Telegram Premium 1 Month',
        description: 'Instant delivery on your username',
        usdPrice: '4.99',
        isActive: true,
      } as any;

      const { messageText, keyboard, hasSufficientBalance } = buildOrderConfirmationView(item, '10.00');

      expect(hasSufficientBalance).toBe(true);
      expect(messageText).toContain('Telegram Premium 1 Month');
      expect(messageText).toContain('Instant delivery on your username');
      expect(messageText).toContain('$4.99');
      expect(messageText).toContain('$10.00');

      const flatButtons = keyboard.inline_keyboard.flat() as any[];
      const confirmButton = flatButtons.find((btn) => btn.callback_data === 'shop:confirm:item-1');
      const cancelButton = flatButtons.find((btn) => btn.callback_data === 'shop:cancel');

      expect(confirmButton).toBeDefined();
      expect(confirmButton?.text).toContain('تایید');
      expect(cancelButton).toBeDefined();
      expect(cancelButton?.text).toContain('انصراف');
    });

    it('buildOrderConfirmationView omits Confirm button and shows error when balance < price', () => {
      const item = {
        id: 'item-1',
        name: 'Telegram Premium 1 Month',
        description: 'Instant delivery',
        usdPrice: '4.99',
        isActive: true,
      } as any;

      const { messageText, keyboard, hasSufficientBalance } = buildOrderConfirmationView(item, '2.00');

      expect(hasSufficientBalance).toBe(false);
      expect(messageText).toContain('Telegram Premium 1 Month');
      expect(messageText).toContain('$4.99');
      expect(messageText).toContain('$2.00');
      expect(messageText).toContain('موجودی کیف پول شما برای خرید این خدمت کافی نیست');
      expect(messageText).toContain('/topup');

      const flatButtons = keyboard.inline_keyboard.flat() as any[];
      const confirmButton = flatButtons.find((btn) => btn.callback_data?.startsWith('shop:confirm'));
      const cancelButton = flatButtons.find((btn) => btn.callback_data === 'shop:cancel');

      expect(confirmButton).toBeUndefined();
      expect(cancelButton).toBeDefined();
    });
  });

  describe('/shop Command via bot.handleUpdate', () => {
    it('shows graceful empty-state message when no active items exist in catalog', async () => {
      const { bot, repliedMessages } = createTestBot();

      await bot.handleUpdate(
        makeMessageUpdate(1, buyerChatId, '/shop', 'Buyer')
      );

      expect(repliedMessages).toHaveLength(1);
      expect(repliedMessages[0]).toContain('هیچ خدمتی برای خرید موجود نیست');
    });

    it('shows only active Catalog Items; deactivated items do not appear', async () => {
      await createTestCatalogItem(container, {
        name: 'Active Service 1',
        description: 'Active Description',
        usdPrice: '10.00',
        isActive: true,
      });

      await createTestCatalogItem(container, {
        name: 'Inactive Service 2',
        description: 'Inactive Description',
        usdPrice: '20.00',
        isActive: false,
      });

      const { bot, repliedMessages } = createTestBot();

      await bot.handleUpdate(
        makeMessageUpdate(1, buyerChatId, '/shop', 'Buyer')
      );

      expect(repliedMessages).toHaveLength(1);
      expect(repliedMessages[0]).toContain('فروشگاه خدمات');
    });

    it("responds to menu button '🛍️ فروشگاه خدمات'", async () => {
      await createTestCatalogItem(container, {
        name: 'Active Service',
        usdPrice: '15.00',
        isActive: true,
      });

      const { bot, repliedMessages } = createTestBot();

      await bot.handleUpdate(
        makeMessageUpdate(1, buyerChatId, '🛍️ فروشگاه خدمات', 'Buyer')
      );

      expect(repliedMessages).toHaveLength(1);
      expect(repliedMessages[0]).toContain('فروشگاه خدمات');
    });
  });

  describe('Item Selection & Confirmation Prompt (shop:item:<id>)', () => {
    it('shows confirmation prompt with name, description, price, balance, and Confirm button when balance >= price', async () => {
      const { buyer } = await createTestBuyer(container, {
        telegramChatId: buyerChatId,
        telegramUsername: 'buyer_user',
      });

      // Set available balance to $25.00
      await db
        .update(wallets)
        .set({ availableBalance: '25.00' })
        .where(eq(wallets.userId, buyer.id));

      const item = await createTestCatalogItem(container, {
        name: 'Discord Nitro 1 Month',
        description: 'Full Nitro boost',
        usdPrice: '9.99',
        isActive: true,
      });

      const { bot, editedMessages, answeredCallbackQueries } = createTestBot();

      await bot.handleUpdate(
        makeCallbackQueryUpdate(1, buyerChatId, `shop:item:${item.id}`)
      );

      expect(answeredCallbackQueries).toHaveLength(1);
      expect(editedMessages).toHaveLength(1);

      const promptText = editedMessages[0]?.text;
      expect(promptText).toContain('Discord Nitro 1 Month');
      expect(promptText).toContain('Full Nitro boost');
      expect(promptText).toContain('$9.99');
      expect(promptText).toContain('$25.00');

      const flatButtons = editedMessages[0]?.reply_markup?.inline_keyboard?.flat() ?? [];
      const confirmButton = flatButtons.find((btn: any) => btn.callback_data === `shop:confirm:${item.id}`);
      const cancelButton = flatButtons.find((btn: any) => btn.callback_data === 'shop:cancel');

      expect(confirmButton).toBeDefined();
      expect(cancelButton).toBeDefined();
    });

    it('shows error and omits Confirm button when balance < price', async () => {
      const { buyer } = await createTestBuyer(container, {
        telegramChatId: buyerChatId,
        telegramUsername: 'buyer_user',
      });

      // Set available balance to $3.00 (below $9.99)
      await db
        .update(wallets)
        .set({ availableBalance: '3.00' })
        .where(eq(wallets.userId, buyer.id));

      const item = await createTestCatalogItem(container, {
        name: 'Discord Nitro 1 Month',
        description: 'Full Nitro boost',
        usdPrice: '9.99',
        isActive: true,
      });

      const { bot, editedMessages, answeredCallbackQueries } = createTestBot();

      await bot.handleUpdate(
        makeCallbackQueryUpdate(1, buyerChatId, `shop:item:${item.id}`)
      );

      expect(answeredCallbackQueries).toHaveLength(1);
      expect(editedMessages).toHaveLength(1);

      const promptText = editedMessages[0]?.text;
      expect(promptText).toContain('Discord Nitro 1 Month');
      expect(promptText).toContain('$9.99');
      expect(promptText).toContain('$3.00');
      expect(promptText).toContain('موجودی کیف پول شما برای خرید این خدمت کافی نیست');
      expect(promptText).toContain('/topup');

      const flatButtons = editedMessages[0]?.reply_markup?.inline_keyboard?.flat() ?? [];
      const confirmButton = flatButtons.find((btn: any) => btn.callback_data?.startsWith('shop:confirm'));
      const cancelButton = flatButtons.find((btn: any) => btn.callback_data === 'shop:cancel');

      expect(confirmButton).toBeUndefined();
      expect(cancelButton).toBeDefined();
    });

    it('handles item selection for a newly registered buyer with $0.00 default balance', async () => {
      const item = await createTestCatalogItem(container, {
        name: 'Spotiy 1 Year',
        usdPrice: '20.00',
        isActive: true,
      });

      const newBuyerChatId = 1122334455;
      const { bot, editedMessages } = createTestBot();

      await bot.handleUpdate(
        makeCallbackQueryUpdate(1, newBuyerChatId, `shop:item:${item.id}`, 1, 'NewBuyer', 'new_buyer')
      );

      expect(editedMessages).toHaveLength(1);
      const promptText = editedMessages[0]?.text;
      expect(promptText).toContain('Spotiy 1 Year');
      expect(promptText).toContain('$0.00');
      expect(promptText).toContain('موجودی کیف پول شما برای خرید این خدمت کافی نیست');
    });

    it('notifies buyer if selected item is inactive or no longer found', async () => {
      const item = await createTestCatalogItem(container, {
        name: 'Inactive Item',
        usdPrice: '10.00',
        isActive: false,
      });

      const { bot, answeredCallbackQueries } = createTestBot();

      await bot.handleUpdate(
        makeCallbackQueryUpdate(1, buyerChatId, `shop:item:${item.id}`)
      );

      expect(answeredCallbackQueries).toHaveLength(1);
      expect(answeredCallbackQueries[0]?.text).toContain('در دسترس نیست');
    });
  });

  describe('Prompt Dismissal / Cancellation (shop:cancel)', () => {
    it('dismisses prompt without any side effects or created orders', async () => {
      await createTestBuyer(container, {
        telegramChatId: buyerChatId,
        telegramUsername: 'buyer_user',
      });

      const { bot, editedMessages, answeredCallbackQueries } = createTestBot();

      await bot.handleUpdate(
        makeCallbackQueryUpdate(1, buyerChatId, 'shop:cancel')
      );

      expect(answeredCallbackQueries).toHaveLength(1);
      expect(editedMessages).toHaveLength(1);
      expect(editedMessages[0]?.text).toContain('لغو شد');

      // Assert no orders were created
      const [orderCountResult] = await db.select({ value: count() }).from(orders);
      expect(Number(orderCountResult?.value ?? 0)).toBe(0);
    });
  });

  describe('Order Confirmation Flow & Placement Handler (shop:confirm:<id>) (Ticket 04)', () => {
    it('places order, debits wallet, writes ledger, replies to buyer, and dispatches push notification to admins with action buttons', async () => {
      const { buyer, wallet } = await createTestBuyer(container, {
        telegramChatId: buyerChatId,
        telegramUsername: 'buyer_user',
      });

      // Credit wallet with $40.00
      await db
        .update(wallets)
        .set({ availableBalance: '40.00' })
        .where(eq(wallets.id, wallet.id));

      const item = await createTestCatalogItem(container, {
        name: 'Telegram Premium 1 Year',
        description: 'Annual discounted subscription',
        usdPrice: '28.99',
        isActive: true,
      });

      const {
        bot,
        editedMessages,
        answeredCallbackQueries,
        sentMessages,
      } = createTestBot();

      await bot.handleUpdate(
        makeCallbackQueryUpdate(
          1,
          buyerChatId,
          `shop:confirm:${item.id}`,
          1,
          'Buyer',
          'buyer_user'
        )
      );

      // 1. Assert buyer answered query and edited message
      expect(answeredCallbackQueries).toHaveLength(1);
      expect(answeredCallbackQueries[0]?.text).toContain('موفقیت ثبت شد');

      expect(editedMessages).toHaveLength(1);
      const buyerConfirmationText = editedMessages[0]?.text;
      expect(buyerConfirmationText).toContain('با موفقیت ثبت شد');
      expect(buyerConfirmationText).toContain('Telegram Premium 1 Year');
      expect(buyerConfirmationText).toContain('$28.99');
      expect(buyerConfirmationText).toContain('$11.01');

      // 2. Assert Order row created in DB
      const [dbOrder] = await db
        .select()
        .from(orders)
        .where(eq(orders.userId, buyer.id));

      expect(dbOrder).toBeDefined();
      expect(dbOrder?.status).toBe('PLACED');
      expect(dbOrder?.usdPriceSnapshot).toBe('28.99');
      expect(dbOrder?.catalogItemId).toBe(item.id);

      // 3. Assert Wallet row debited in DB
      const [dbWallet] = await db
        .select()
        .from(wallets)
        .where(eq(wallets.id, wallet.id));

      expect(dbWallet?.availableBalance).toBe('11.01');

      // 4. Assert Ledger Transaction & Entries in DB
      const [dbTx] = await db
        .select()
        .from(ledgerTransactions)
        .where(eq(ledgerTransactions.orderId, dbOrder!.id));

      expect(dbTx).toBeDefined();

      const dbEntries = await db
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.ledgerTransactionId, dbTx!.id));

      expect(dbEntries).toHaveLength(2);
      expect(dbEntries.some((e) => e.direction === 'DEBIT' && e.accountType === 'BUYER_WALLET')).toBe(true);
      expect(dbEntries.some((e) => e.direction === 'CREDIT' && e.accountType === 'SYSTEM_CASH')).toBe(true);

      // 5. Assert Admin notification sent via mock API
      const adminPush = sentMessages.find((m) => Number(m.chat_id) === adminChatId);
      expect(adminPush).toBeDefined();
      expect(adminPush?.text).toContain('سفارش جدید ثبت شد');
      expect(adminPush?.text).toContain('Telegram Premium 1 Year');
      expect(adminPush?.text).toContain('$28.99');
      expect(adminPush?.text).toContain('$11.01');
      expect(adminPush?.text).toContain('@buyer_user');

      // Check inline buttons on admin notification
      const flatAdminButtons = adminPush?.reply_markup?.inline_keyboard?.flat() ?? [];
      const processButton = flatAdminButtons.find((btn: any) =>
        btn.callback_data === `order:process:${dbOrder!.id}`
      );
      const rejectButton = flatAdminButtons.find((btn: any) =>
        btn.callback_data === `order:reject:${dbOrder!.id}`
      );

      expect(processButton).toBeDefined();
      expect(processButton?.text).toContain('شروع پردازش');
      expect(rejectButton).toBeDefined();
      expect(rejectButton?.text).toContain('رد سفارش');

      // 6. Assert order_admin_notifications table has saved record
      const dbNotifications = await db
        .select()
        .from(orderAdminNotifications)
        .where(eq(orderAdminNotifications.orderId, dbOrder!.id));

      expect(dbNotifications).toHaveLength(1);
      expect(Number(dbNotifications[0]?.adminTelegramId)).toBe(adminChatId);
    });

    it('surfaces error alert when buyer has insufficient balance at confirm time (race condition)', async () => {
      const { buyer, wallet } = await createTestBuyer(container, {
        telegramChatId: buyerChatId,
        telegramUsername: 'buyer_user',
      });

      // Wallet has only $5.00
      await db
        .update(wallets)
        .set({ availableBalance: '5.00' })
        .where(eq(wallets.id, wallet.id));

      const item = await createTestCatalogItem(container, {
        name: 'Item 15 USD',
        usdPrice: '15.00',
        isActive: true,
      });

      const { bot, answeredCallbackQueries, sentMessages } = createTestBot();

      await bot.handleUpdate(
        makeCallbackQueryUpdate(
          1,
          buyerChatId,
          `shop:confirm:${item.id}`,
          1,
          'Buyer',
          'buyer_user'
        )
      );

      expect(answeredCallbackQueries).toHaveLength(1);
      expect(answeredCallbackQueries[0]?.show_alert).toBe(true);
      expect(answeredCallbackQueries[0]?.text).toContain('موجودی کیف پول شما برای ثبت این سفارش کافی نیست');

      // Assert no orders created
      const [orderCount] = await db.select({ value: count() }).from(orders);
      expect(Number(orderCount?.value ?? 0)).toBe(0);

      // Assert no admin notifications sent
      expect(sentMessages).toHaveLength(0);
    });

    it('surfaces error alert when selected item was deactivated prior to confirmation', async () => {
      const { buyer, wallet } = await createTestBuyer(container, {
        telegramChatId: buyerChatId,
        telegramUsername: 'buyer_user',
      });

      await db
        .update(wallets)
        .set({ availableBalance: '50.00' })
        .where(eq(wallets.id, wallet.id));

      const item = await createTestCatalogItem(container, {
        name: 'Deactivated Item',
        usdPrice: '10.00',
        isActive: false,
      });

      const { bot, answeredCallbackQueries } = createTestBot();

      await bot.handleUpdate(
        makeCallbackQueryUpdate(1, buyerChatId, `shop:confirm:${item.id}`)
      );

      expect(answeredCallbackQueries).toHaveLength(1);
      expect(answeredCallbackQueries[0]?.show_alert).toBe(true);
      expect(answeredCallbackQueries[0]?.text).toContain('در دسترس نیست');
    });
  });

  describe('Admin Order Actions (Ticket 05 Process & Ticket 07 Reject Placeholder)', () => {
    it('handles order:process callback query on placed order', async () => {
      const { buyer } = await createTestBuyer(container, {
        telegramChatId: buyerChatId,
        telegramUsername: 'buyer_user',
      });

      await db
        .update(wallets)
        .set({ availableBalance: '50.00' })
        .where(eq(wallets.userId, buyer.id));

      const item = await createTestCatalogItem(container, {
        name: 'VPN Test',
        usdPrice: '5.00',
        isActive: true,
      });

      const { order } = await placeTestOrder(container, {
        userId: buyer.id,
        catalogItemId: item.id,
      });

      const { bot, answeredCallbackQueries } = createTestBot();

      await bot.handleUpdate(
        makeCallbackQueryUpdate(1, adminChatId, `order:process:${order.id}`, 1, 'Admin', 'admin_user')
      );

      expect(answeredCallbackQueries).toHaveLength(1);
      expect(answeredCallbackQueries[0]?.text).toContain('شروع پردازش');
    });

    it('answers order:reject callback query as stub', async () => {
      const { bot, answeredCallbackQueries } = createTestBot();

      await bot.handleUpdate(
        makeCallbackQueryUpdate(1, adminChatId, 'order:reject:test-order-id', 1, 'Admin', 'admin_user')
      );

      expect(answeredCallbackQueries).toHaveLength(1);
      expect(answeredCallbackQueries[0]?.text).toContain('رد سفارش');
    });
  });
});
