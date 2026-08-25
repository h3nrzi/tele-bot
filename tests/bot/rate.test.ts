import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDatabase } from '../helpers/test-db';
import { createMockContext, captureBotReplies } from '../helpers/mock-context';
import {
  handleRate,
  getCurrentRateMessage,
  getNoRateConfiguredMessage,
} from '../../src/bot/handlers/rate';
import { setRate } from '../../src/services/exchange-rate.service';
import { createBot } from '../../src/bot/bot';

describe('/rate Handler', () => {
  const { db } = setupTestDatabase();
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

    await handleRate(ctx, db);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(repliedMessages[0]).toBe(getNoRateConfiguredMessage());
    expect(repliedMessages[0]?.toLowerCase()).toContain('no');
    expect(repliedMessages[0]?.toLowerCase()).toContain('rate');
  });

  it('replies with current rate and when it was set if rate exists', async () => {
    const createdRate = await setRate(adminChatId, 620000n, db);

    const { ctx, repliedMessages } = createMockContext({
      id: adminChatId,
      username: 'admin_user',
    });

    await handleRate(ctx, db);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(repliedMessages[0]).toBe(getCurrentRateMessage(createdRate));
    expect(repliedMessages[0]).toContain('620,000');
    expect(repliedMessages[0]).toContain(createdRate.createdAt.toISOString());
  });

  it('shows the latest rate and timestamp when multiple rates have been set', async () => {
    await setRate(adminChatId, 600000n, db);
    const secondRate = await setRate(adminChatId, 650000n, db);

    const { ctx, repliedMessages } = createMockContext({
      id: adminChatId,
      username: 'admin_user',
    });

    await handleRate(ctx, db);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(repliedMessages[0]).toBe(getCurrentRateMessage(secondRate));
    expect(repliedMessages[0]).toContain('650,000');
    expect(repliedMessages[0]).toContain(secondRate.createdAt.toISOString());
  });

  it('silently ignores update if ctx.from is undefined', async () => {
    const { ctx } = createMockContext(undefined);

    await handleRate(ctx, db);

    expect(ctx.reply).not.toHaveBeenCalled();
  });

  describe('Bot integration with /rate', () => {
    it('executes /rate command for Admin and shows current rate via bot.handleUpdate', async () => {
      const activeRate = await setRate(adminChatId, 630000n, db);

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
      expect(repliedMessages[0]).toBe(getCurrentRateMessage(activeRate));
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
      expect(repliedMessages[0]).toBe(getNoRateConfiguredMessage());
    });

    it('silently ignores /rate command when sent by a non-Admin', async () => {
      const nonAdminChatId = 999888777;
      await setRate(adminChatId, 630000n, db);

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
