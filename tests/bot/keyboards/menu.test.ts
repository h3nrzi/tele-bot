import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { captureBotReplies } from '@tests/helpers/mock-context';
import { createBot } from '@/bot/bot';
import { createTestBuyer, setTestRate } from '@tests/helpers/fixtures';
import {
  getBuyerMainMenuKeyboard,
  getAdminMainMenuKeyboard,
} from '@/bot/keyboards/menu.keyboards';

describe('Role-based Menus and Keyboards', () => {
  const { db, container } = setupTestDatabase();
  const adminChatId = 123456789;
  const buyerChatId = 987654321;

  it('creates valid Buyer reply keyboard structure', () => {
    const keyboard = getBuyerMainMenuKeyboard();
    expect(keyboard).toBeDefined();
    // Verify keyboard buttons contain the expected texts
    const flatButtons = keyboard.build().flat();
    const buttonTexts = flatButtons.map((btn: any) => (typeof btn === 'string' ? btn : btn.text));
    expect(buttonTexts).toContain('💰 موجودی کیف پول');
    expect(buttonTexts).toContain('➕ افزایش موجودی');
    expect(buttonTexts).toContain('📋 پیگیری وضعیت');
    expect(buttonTexts).toContain('❌ لغو درخواست');
  });

  it('creates valid Admin reply keyboard structure', () => {
    const keyboard = getAdminMainMenuKeyboard();
    expect(keyboard).toBeDefined();
    const flatButtons = keyboard.build().flat();
    const buttonTexts = flatButtons.map((btn: any) => (typeof btn === 'string' ? btn : btn.text));
    expect(buttonTexts).toContain('⏳ درخواست‌های در انتظار');
    expect(buttonTexts).toContain('💳 تنظیم کارت بانکی');
    expect(buttonTexts).toContain('💱 نرخ ارز فعلی');
    expect(buttonTexts).toContain('✏️ تنظیم نرخ ارز');
  });

  describe('Buyer Menu Buttons via bot.handleUpdate', () => {
    let bot: ReturnType<typeof createBot>;
    let repliedMessages: string[];

    beforeEach(async () => {
      await createTestBuyer(
        container,
        { telegramChatId: buyerChatId, telegramUsername: 'buyer_user' }
      );

      bot = createBot({
        token: 'test_token',
        dbClient: db,
        adminIds: `${adminChatId}`,
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

      repliedMessages = captureBotReplies(bot);
    });

    it("triggers balance reply when sending '💰 موجودی کیف پول'", async () => {
      await bot.handleUpdate({
        update_id: 1,
        message: {
          message_id: 1,
          date: Math.floor(Date.now() / 1000),
          chat: { id: buyerChatId, type: 'private', first_name: 'Buyer' },
          from: { id: buyerChatId, is_bot: false, first_name: 'Buyer' },
          text: '💰 موجودی کیف پول',
        },
      });

      expect(repliedMessages).toHaveLength(1);
      expect(repliedMessages[0]).toContain('موجودی کیف پول');
      expect(repliedMessages[0]).toContain('$0.00');
    });

    it("triggers status reply when sending '📋 پیگیری وضعیت'", async () => {
      await bot.handleUpdate({
        update_id: 2,
        message: {
          message_id: 2,
          date: Math.floor(Date.now() / 1000),
          chat: { id: buyerChatId, type: 'private', first_name: 'Buyer' },
          from: { id: buyerChatId, is_bot: false, first_name: 'Buyer' },
          text: '📋 پیگیری وضعیت',
        },
      });

      expect(repliedMessages).toHaveLength(1);
      expect(repliedMessages[0]).toContain('هیچ درخواست افزایش موجودی ثبت نکرده‌اید');
    });

    it("triggers cancel reply when sending '❌ لغو درخواست'", async () => {
      await bot.handleUpdate({
        update_id: 3,
        message: {
          message_id: 3,
          date: Math.floor(Date.now() / 1000),
          chat: { id: buyerChatId, type: 'private', first_name: 'Buyer' },
          from: { id: buyerChatId, is_bot: false, first_name: 'Buyer' },
          text: '❌ لغو درخواست',
        },
      });

      expect(repliedMessages).toHaveLength(1);
      expect(repliedMessages[0]).toContain('هیچ درخواست افزایش موجودی فعالی');
    });
  });

  describe('Admin Menu Buttons via bot.handleUpdate', () => {
    let bot: ReturnType<typeof createBot>;
    let repliedMessages: string[];

    beforeEach(async () => {
      bot = createBot({
        token: 'test_token',
        dbClient: db,
        adminIds: `${adminChatId}`,
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

      repliedMessages = captureBotReplies(bot);
    });

    it("triggers rate reply when sending '💱 نرخ ارز فعلی' as Admin", async () => {
      await setTestRate(container, { adminTelegramId: BigInt(adminChatId), irrPerUsd: 630000n });

      await bot.handleUpdate({
        update_id: 10,
        message: {
          message_id: 10,
          date: Math.floor(Date.now() / 1000),
          chat: { id: adminChatId, type: 'private', first_name: 'Admin' },
          from: { id: adminChatId, is_bot: false, first_name: 'Admin' },
          text: '💱 نرخ ارز فعلی',
        },
      });

      expect(repliedMessages).toHaveLength(1);
      expect(repliedMessages[0]).toContain('630,000');
    });

    it("triggers rate guide when sending '✏️ تنظیم نرخ ارز' as Admin", async () => {
      await bot.handleUpdate({
        update_id: 11,
        message: {
          message_id: 11,
          date: Math.floor(Date.now() / 1000),
          chat: { id: adminChatId, type: 'private', first_name: 'Admin' },
          from: { id: adminChatId, is_bot: false, first_name: 'Admin' },
          text: '✏️ تنظیم نرخ ارز',
        },
      });

      expect(repliedMessages).toHaveLength(1);
      expect(repliedMessages[0]).toContain('/setrate');
    });

    it('silently ignores Admin menu buttons when sent by a non-Admin', async () => {
      await bot.handleUpdate({
        update_id: 12,
        message: {
          message_id: 12,
          date: Math.floor(Date.now() / 1000),
          chat: { id: buyerChatId, type: 'private', first_name: 'Buyer' },
          from: { id: buyerChatId, is_bot: false, first_name: 'Buyer' },
          text: '💱 نرخ ارز فعلی',
        },
      });

      expect(repliedMessages).toHaveLength(0);
    });
  });

  describe('Telegram Commands Setup', () => {
    it('configures default and chat-scoped commands and menu buttons properly', async () => {
      const calls: any[] = [];
      const mockApi: any = {
        setChatMenuButton: vi.fn(async (args) => {
          calls.push({ method: 'setChatMenuButton', args });
        }),
        setMyCommands: vi.fn(async (commands, options) => {
          calls.push({ method: 'setMyCommands', args: { commands, options } });
        }),
      };

      const { setupBotCommands } = await import('@/bot/commands');
      await setupBotCommands(mockApi, `${adminChatId}`);

      expect(mockApi.setChatMenuButton).toHaveBeenCalledTimes(2); // global + admin chat
      expect(mockApi.setMyCommands).toHaveBeenCalledTimes(2); // default scope + admin chat scope
    });
  });
});
