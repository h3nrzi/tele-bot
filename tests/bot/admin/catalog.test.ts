import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { createMockFetch } from '@tests/helpers/mock-context';
import { createBot } from '@/bot/bot';
import { catalogItems } from '@/modules/catalog/catalog.schema';
import { createTestCatalogItem } from '@tests/helpers/fixtures';
import {
  isKeepCommand,
  isSkipCommand,
  isCancelCommand,
} from '@/bot/handlers/admin/catalog.conversation';
import { count, eq } from 'drizzle-orm';

describe('/catalog Admin Command, Dashboard & Conversations', () => {
  const { db, container } = setupTestDatabase();
  const adminChatId = 123456789;
  const nonAdminChatId = 999888777;
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
    senderName = 'Admin'
  ) {
    const isCommand = text.startsWith('/');
    const commandLength = text.indexOf(' ') > 0 ? text.indexOf(' ') : text.length;

    const message: Record<string, unknown> = {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: 'private', first_name: senderName },
      from: { id: chatId, is_bot: false, first_name: senderName },
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
    senderName = 'Admin'
  ) {
    return {
      update_id: updateId,
      callback_query: {
        id: `cb_${updateId}`,
        from: { id: chatId, is_bot: false, first_name: senderName },
        message: {
          message_id: messageId,
          date: Math.floor(Date.now() / 1000),
          chat: { id: chatId, type: 'private', first_name: senderName },
          text: '📦 کاتالوگ خدمات',
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

  describe('Utility functions', () => {
    it('identifies keep commands correctly', () => {
      expect(isKeepCommand('/keep')).toBe(true);
      expect(isKeepCommand('keep')).toBe(true);
      expect(isKeepCommand('KEEP')).toBe(true);
      expect(isKeepCommand('حفظ')).toBe(true);
      expect(isKeepCommand('-')).toBe(true);
      expect(isKeepCommand('New Value')).toBe(false);
    });

    it('identifies skip commands correctly', () => {
      expect(isSkipCommand('/skip')).toBe(true);
      expect(isSkipCommand('skip')).toBe(true);
      expect(isSkipCommand('SKIP')).toBe(true);
      expect(isSkipCommand('-')).toBe(true);
      expect(isSkipCommand('Some note')).toBe(false);
    });

    it('identifies cancel commands correctly', () => {
      expect(isCancelCommand('/cancel')).toBe(true);
      expect(isCancelCommand('cancel')).toBe(true);
      expect(isCancelCommand('لغو')).toBe(true);
      expect(isCancelCommand('Valid Item')).toBe(false);
    });
  });

  describe('Access Control', () => {
    it('sends access-denied message when non-Admin executes /catalog', async () => {
      const { bot, repliedMessages } = createTestBot();

      await bot.handleUpdate(
        makeMessageUpdate(1, nonAdminChatId, '/catalog', 'Buyer')
      );

      expect(repliedMessages).toHaveLength(1);
      expect(repliedMessages[0]).toContain('دسترسی غیرمجاز');
    });

    it('opens dashboard when Admin executes /catalog', async () => {
      const { bot, repliedMessages } = createTestBot();

      await bot.handleUpdate(
        makeMessageUpdate(1, adminChatId, '/catalog', 'Admin')
      );

      expect(repliedMessages).toHaveLength(1);
      expect(repliedMessages[0]).toContain('کاتالوگ خدمات');
    });
  });

  describe('Dashboard View & Toggle', () => {
    it('renders empty catalog dashboard message when no items exist', async () => {
      const { bot, repliedMessages } = createTestBot();

      await bot.handleUpdate(
        makeMessageUpdate(1, adminChatId, '/catalog', 'Admin')
      );

      expect(repliedMessages).toHaveLength(1);
      expect(repliedMessages[0]).toContain('هیچ خدمتی در کاتالوگ ثبت نشده است');
    });

    it('renders catalog items with active and inactive indicators in dashboard', async () => {
      const item1 = await createTestCatalogItem(container, {
        name: 'Telegram Premium 1 Month',
        description: 'Instant activation',
        usdPrice: '4.99',
        isActive: true,
      });

      const item2 = await createTestCatalogItem(container, {
        name: 'VPN 1 Year',
        description: 'High speed VPN',
        usdPrice: '30.00',
        isActive: false,
      });

      const { bot, repliedMessages } = createTestBot();

      await bot.handleUpdate(
        makeMessageUpdate(1, adminChatId, '/catalog', 'Admin')
      );

      expect(repliedMessages).toHaveLength(1);
      expect(repliedMessages[0]).toContain('Telegram Premium 1 Month');
      expect(repliedMessages[0]).toContain('$4.99');
      expect(repliedMessages[0]).toContain('VPN 1 Year');
      expect(repliedMessages[0]).toContain('$30.00');
    });

    it('toggles is_active immediately when tapping deactivate/reactivate button', async () => {
      const item = await createTestCatalogItem(container, {
        name: 'Service Item',
        usdPrice: '10.00',
        isActive: true,
      });

      const { bot, editedMessages } = createTestBot();

      // Step 1: Deactivate
      await bot.handleUpdate(
        makeCallbackQueryUpdate(1, adminChatId, `catalog:toggle:${item.id}`)
      );

      const [inDbAfterDeactivate] = await db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.id, item.id));

      expect(inDbAfterDeactivate?.isActive).toBe(false);
      expect(editedMessages.length).toBeGreaterThanOrEqual(1);

      // Step 2: Reactivate
      await bot.handleUpdate(
        makeCallbackQueryUpdate(2, adminChatId, `catalog:toggle:${item.id}`)
      );

      const [inDbAfterReactivate] = await db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.id, item.id));

      expect(inDbAfterReactivate?.isActive).toBe(true);
    });
  });

  describe('Add Catalog Item Conversation ([+ Add New])', () => {
    it('walks Admin through complete add flow and creates item in DB', async () => {
      const { bot, repliedMessages } = createTestBot();

      // Step 1: Click [+ Add New]
      await bot.handleUpdate(
        makeCallbackQueryUpdate(1, adminChatId, 'catalog:add')
      );

      expect(repliedMessages[0]).toContain('نام خدمت');

      // Step 2: Send Name
      await bot.handleUpdate(
        makeMessageUpdate(2, adminChatId, 'Telegram Stars 500')
      );

      expect(repliedMessages[1]).toContain('توضیحات');

      // Step 3: Send Description
      await bot.handleUpdate(
        makeMessageUpdate(3, adminChatId, '500 in-app stars for gifts')
      );

      expect(repliedMessages[2]).toContain('قیمت');

      // Step 4: Send Price
      await bot.handleUpdate(makeMessageUpdate(4, adminChatId, '9.99'));

      expect(repliedMessages[3]).toContain('تایید');
      expect(repliedMessages[3]).toContain('Telegram Stars 500');
      expect(repliedMessages[3]).toContain('$9.99');

      // Step 5: Confirm
      await bot.handleUpdate(makeMessageUpdate(5, adminChatId, 'بله'));

      expect(repliedMessages[4]).toContain('با موفقیت ایجاد شد');

      const allItems = await db.select().from(catalogItems);
      expect(allItems).toHaveLength(1);
      expect(allItems[0]?.name).toBe('Telegram Stars 500');
      expect(allItems[0]?.description).toBe('500 in-app stars for gifts');
      expect(allItems[0]?.usdPrice).toBe('9.99');
      expect(allItems[0]?.isActive).toBe(true);
    });

    it('allows skipping description with /skip in add flow', async () => {
      const { bot, repliedMessages } = createTestBot();

      await bot.handleUpdate(
        makeCallbackQueryUpdate(1, adminChatId, 'catalog:add')
      );
      await bot.handleUpdate(makeMessageUpdate(2, adminChatId, 'Gift Card 50'));
      await bot.handleUpdate(makeMessageUpdate(3, adminChatId, '/skip'));
      await bot.handleUpdate(makeMessageUpdate(4, adminChatId, '50.00'));
      await bot.handleUpdate(makeMessageUpdate(5, adminChatId, 'yes'));

      expect(repliedMessages[4]).toContain('با موفقیت ایجاد شد');

      const allItems = await db.select().from(catalogItems);
      expect(allItems).toHaveLength(1);
      expect(allItems[0]?.name).toBe('Gift Card 50');
      expect(allItems[0]?.description).toBeNull();
      expect(allItems[0]?.usdPrice).toBe('50.00');
    });

    it('re-prompts on invalid name or invalid price in add flow', async () => {
      const { bot, repliedMessages } = createTestBot();

      await bot.handleUpdate(
        makeCallbackQueryUpdate(1, adminChatId, 'catalog:add')
      );
      expect(repliedMessages[0]).toContain('نام خدمت');

      // Invalid name (whitespace)
      await bot.handleUpdate(makeMessageUpdate(2, adminChatId, '   '));
      expect(repliedMessages[1]).toContain('نام خدمت');

      // Valid name
      await bot.handleUpdate(makeMessageUpdate(3, adminChatId, 'Valid Name'));
      expect(repliedMessages[2]).toContain('توضیحات');

      // Skip description
      await bot.handleUpdate(makeMessageUpdate(4, adminChatId, 'skip'));
      expect(repliedMessages[3]).toContain('قیمت');

      // Invalid price (negative)
      await bot.handleUpdate(makeMessageUpdate(5, adminChatId, '-5'));
      expect(repliedMessages[4]).toContain('قیمت وارد شده نامعتبر است');

      // Valid price
      await bot.handleUpdate(makeMessageUpdate(6, adminChatId, '15.50'));
      expect(repliedMessages[5]).toContain('تایید');

      // Confirm
      await bot.handleUpdate(makeMessageUpdate(7, adminChatId, 'تایید'));
      expect(repliedMessages[6]).toContain('با موفقیت ایجاد شد');
    });

    it('cancels add conversation when /cancel is sent', async () => {
      const { bot, repliedMessages } = createTestBot();

      await bot.handleUpdate(
        makeCallbackQueryUpdate(1, adminChatId, 'catalog:add')
      );
      await bot.handleUpdate(makeMessageUpdate(2, adminChatId, '/cancel'));

      expect(repliedMessages[1]).toContain('لغو شد');

      const [countResult] = await db.select({ value: count() }).from(catalogItems);
      expect(Number(countResult?.value ?? 0)).toBe(0);
    });
  });

  describe('Edit Catalog Item Conversation ([Edit])', () => {
    it('walks Admin through edit flow with [Keep] to update selected fields', async () => {
      const item = await createTestCatalogItem(container, {
        name: 'Original Service',
        description: 'Original Description',
        usdPrice: '20.00',
      });

      const { bot, repliedMessages } = createTestBot();

      // Step 1: Click [Edit]
      await bot.handleUpdate(
        makeCallbackQueryUpdate(1, adminChatId, `catalog:edit:${item.id}`)
      );

      expect(repliedMessages[0]).toContain('Original Service');
      expect(repliedMessages[0]).toContain('نام جدید');

      // Step 2: Keep current name
      await bot.handleUpdate(makeMessageUpdate(2, adminChatId, '/keep'));

      expect(repliedMessages[1]).toContain('توضیحات جدید');
      expect(repliedMessages[1]).toContain('Original Description');

      // Step 3: Enter new description
      await bot.handleUpdate(
        makeMessageUpdate(3, adminChatId, 'Updated Description')
      );

      expect(repliedMessages[2]).toContain('قیمت جدید');
      expect(repliedMessages[2]).toContain('20.00');

      // Step 4: Enter new price
      await bot.handleUpdate(makeMessageUpdate(4, adminChatId, '24.99'));

      expect(repliedMessages[3]).toContain('به‌روزرسانی شد');

      const [updatedInDb] = await db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.id, item.id));

      expect(updatedInDb?.name).toBe('Original Service');
      expect(updatedInDb?.description).toBe('Updated Description');
      expect(updatedInDb?.usdPrice).toBe('24.99');
    });

    it('cancels edit flow when /cancel is sent', async () => {
      const item = await createTestCatalogItem(container, {
        name: 'Cancel Test Service',
        usdPrice: '10.00',
      });

      const { bot, repliedMessages } = createTestBot();

      await bot.handleUpdate(
        makeCallbackQueryUpdate(1, adminChatId, `catalog:edit:${item.id}`)
      );
      await bot.handleUpdate(makeMessageUpdate(2, adminChatId, '/cancel'));

      expect(repliedMessages[1]).toContain('لغو شد');

      const [inDb] = await db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.id, item.id));

      expect(inDb?.name).toBe('Cancel Test Service');
      expect(inDb?.usdPrice).toBe('10.00');
    });
  });
});
