import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { createMockContext, captureBotReplies } from '@tests/helpers/mock-context';
import { handleRate } from '@/bot/handlers/admin';
import { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import { formatPersianDateTime } from '@/core/shared/date.utils';
import { setTestRate } from '@tests/helpers/fixtures';
import { createBot } from '@/bot/bot';

describe('/rate Handler', () => {
  const { db, container } = setupTestDatabase();
  const exchangeRateService = container.resolve(ExchangeRateService);
  const adminChatId = 123456789;
  const originalEnv = process.env.ADMIN_IDS;

  beforeEach(() => {
    process.env.ADMIN_IDS = `${adminChatId}`;
  });

  afterEach(() => {
    process.env.ADMIN_IDS = originalEnv;
  });

  it('replies with no-rate message when no exchange rate is configured', async () => {
    const { ctx, repliedMessages } = createMockContext({
      id: adminChatId,
      username: 'admin_user',
    });

    await handleRate(ctx, exchangeRateService);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(repliedMessages[0]).toContain('هیچ نرخ ارزی در سیستم تنظیم نشده است');
    expect(repliedMessages[0]).toContain('/setrate');
  });

  it('replies with current rate and when it was set if rate exists', async () => {
    const createdRate = await setTestRate(container, adminChatId, 620000n);

    const { ctx, repliedMessages } = createMockContext({
      id: adminChatId,
      username: 'admin_user',
    });

    await handleRate(ctx, exchangeRateService);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(repliedMessages[0]).toContain('نرخ فعلی تبدیل ارز');
    expect(repliedMessages[0]).toContain('620,000');
    expect(repliedMessages[0]).toContain(formatPersianDateTime(createdRate.createdAt));
  });

  it('shows the latest rate and timestamp when multiple rates have been set', async () => {
    await setTestRate(container, adminChatId, 600000n);
    const secondRate = await setTestRate(container, adminChatId, 650000n);

    const { ctx, repliedMessages } = createMockContext({
      id: adminChatId,
      username: 'admin_user',
    });

    await handleRate(ctx, exchangeRateService);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(repliedMessages[0]).toContain('نرخ فعلی تبدیل ارز');
    expect(repliedMessages[0]).toContain('650,000');
    expect(repliedMessages[0]).toContain(formatPersianDateTime(secondRate.createdAt));
  });

  it('silently ignores update if ctx.from is undefined', async () => {
    const { ctx } = createMockContext(undefined);

    await handleRate(ctx, exchangeRateService);

    expect(ctx.reply).not.toHaveBeenCalled();
  });

  describe('Bot integration with /rate', () => {
    it('executes /rate command for Admin and shows current rate via bot.handleUpdate', async () => {
      await setTestRate(container, adminChatId, 630000n);

      const bot = createBot({
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

      const repliedMessages = captureBotReplies(bot);

      await bot.handleUpdate({
        update_id: 1,
        message: {
          message_id: 1,
          date: Math.floor(Date.now() / 1000),
          chat: { id: adminChatId, type: 'private', first_name: 'Admin' },
          from: { id: adminChatId, is_bot: false, first_name: 'Admin' },
          text: '/rate',
          entities: [{ offset: 0, length: 5, type: 'bot_command' }],
        },
      });

      expect(repliedMessages).toHaveLength(1);
      expect(repliedMessages[0]).toContain('نرخ فعلی تبدیل ارز');
      expect(repliedMessages[0]).toContain('630,000');
    });

    it('executes /rate command for Admin when no rate is configured', async () => {
      const bot = createBot({
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

      const repliedMessages = captureBotReplies(bot);

      await bot.handleUpdate({
        update_id: 2,
        message: {
          message_id: 2,
          date: Math.floor(Date.now() / 1000),
          chat: { id: adminChatId, type: 'private', first_name: 'Admin' },
          from: { id: adminChatId, is_bot: false, first_name: 'Admin' },
          text: '/rate',
          entities: [{ offset: 0, length: 5, type: 'bot_command' }],
        },
      });

      expect(repliedMessages).toHaveLength(1);
      expect(repliedMessages[0]).toContain('هیچ نرخ ارزی در سیستم تنظیم نشده است');
    });

    it('silently ignores /rate command when sent by a non-Admin', async () => {
      const nonAdminChatId = 999888777;
      await setTestRate(container, adminChatId, 630000n);

      const bot = createBot({
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

      const repliedMessages = captureBotReplies(bot);

      await bot.handleUpdate({
        update_id: 3,
        message: {
          message_id: 3,
          date: Math.floor(Date.now() / 1000),
          chat: { id: nonAdminChatId, type: 'private', first_name: 'Buyer' },
          from: { id: nonAdminChatId, is_bot: false, first_name: 'Buyer' },
          text: '/rate',
          entities: [{ offset: 0, length: 5, type: 'bot_command' }],
        },
      });

      expect(repliedMessages).toHaveLength(0);
    });
  });
});
