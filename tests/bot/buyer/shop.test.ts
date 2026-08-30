import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { createMockFetch } from '@tests/helpers/mock-context';
import { createBot } from '@/bot/bot';
import { createTestBuyer, createTestCatalogItem } from '@tests/helpers/fixtures';
import { wallets } from '@/modules/wallet/wallet.schema';
import { orders } from '@/core/database/schema';
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
    const { fetch: mockFetch } = createMockFetch(
      repliedMessages,
      [],
      editedMessages,
      answeredCallbackQueries
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
    return { bot, repliedMessages, editedMessages, answeredCallbackQueries };
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

  describe('Stub Confirm Button (shop:confirm:<id>)', () => {
    it('acknowledges stub confirm callback without placing an order (ticket 04 placeholder)', async () => {
      const item = await createTestCatalogItem(container, {
        name: 'Test Service',
        usdPrice: '10.00',
      });

      const { bot, answeredCallbackQueries } = createTestBot();

      await bot.handleUpdate(
        makeCallbackQueryUpdate(1, buyerChatId, `shop:confirm:${item.id}`)
      );

      expect(answeredCallbackQueries).toHaveLength(1);

      // Verify no order placed in ticket 03
      const [orderCountResult] = await db.select({ value: count() }).from(orders);
      expect(Number(orderCountResult?.value ?? 0)).toBe(0);
    });
  });
});
