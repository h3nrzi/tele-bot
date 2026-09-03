import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { createMockContext, createMockFetch } from '@tests/helpers/mock-context';
import { handleSetRate, cleanRateInput, isValidRateInput } from '@/bot/handlers/admin';
import { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import { createBot } from '@/bot/bot';
import { exchangeRates } from '@/modules/exchange-rate/exchange-rate.schema';
import { count } from 'drizzle-orm';

describe('/setrate Handler', () => {
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

  it('validates positive integer, calls setRate, and confirms new active rate to Admin', async () => {
    const { ctx, repliedMessages } = createMockContext(
      { id: adminChatId, username: 'admin_user' },
      { match: '620000' }
    );

    await handleSetRate(ctx, exchangeRateService);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(repliedMessages[0]).toContain('نرخ جدید با موفقیت تنظیم شد');
    expect(repliedMessages[0]).toContain('620,000');

    const rows = await db.select().from(exchangeRates);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.irrPerUsd).toBe(620000n);
    expect(rows[0]?.createdByAdminTelegramId).toBe(BigInt(adminChatId));
  });

  it('handles arguments with surrounding whitespace', async () => {
    const { ctx, repliedMessages } = createMockContext(
      { id: adminChatId, username: 'admin_user' },
      { match: '   650000   ' }
    );

    await handleSetRate(ctx, exchangeRateService);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(repliedMessages[0]).toContain('نرخ جدید با موفقیت تنظیم شد');
    expect(repliedMessages[0]).toContain('650,000');

    const rows = await db.select().from(exchangeRates);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.irrPerUsd).toBe(650000n);
  });

  it('extracts argument from message text if ctx.match is not set', async () => {
    const { ctx, repliedMessages } = createMockContext(
      { id: adminChatId, username: 'admin_user' },
      { text: '/setrate 700000' }
    );

    await handleSetRate(ctx, exchangeRateService);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(repliedMessages[0]).toContain('نرخ جدید با موفقیت تنظیم شد');
    expect(repliedMessages[0]).toContain('700,000');

    const rows = await db.select().from(exchangeRates);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.irrPerUsd).toBe(700000n);
  });

  it('replies with usage error and does not insert row when argument is missing', async () => {
    const { ctx, repliedMessages } = createMockContext(
      { id: adminChatId, username: 'admin_user' },
      { match: '' }
    );

    await handleSetRate(ctx, exchangeRateService);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(repliedMessages[0]).toContain('فرمت نرخ وارد شده نامعتبر است');

    const [countResult] = await db.select({ value: count() }).from(exchangeRates);
    expect(Number(countResult?.value ?? 0)).toBe(0);
  });

  it('replies with usage error and does not insert row when argument is 0', async () => {
    const { ctx, repliedMessages } = createMockContext(
      { id: adminChatId, username: 'admin_user' },
      { match: '0' }
    );

    await handleSetRate(ctx, exchangeRateService);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(repliedMessages[0]).toContain('فرمت نرخ وارد شده نامعتبر است');

    const [countResult] = await db.select({ value: count() }).from(exchangeRates);
    expect(Number(countResult?.value ?? 0)).toBe(0);
  });

  it('replies with usage error and does not insert row when argument is negative', async () => {
    const { ctx, repliedMessages } = createMockContext(
      { id: adminChatId, username: 'admin_user' },
      { match: '-50000' }
    );

    await handleSetRate(ctx, exchangeRateService);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(repliedMessages[0]).toContain('فرمت نرخ وارد شده نامعتبر است');

    const [countResult] = await db.select({ value: count() }).from(exchangeRates);
    expect(Number(countResult?.value ?? 0)).toBe(0);
  });

  it('replies with usage error and does not insert row when argument is non-numeric or float', async () => {
    const { ctx: ctxText, repliedMessages: messagesText } = createMockContext(
      { id: adminChatId, username: 'admin_user' },
      { match: 'abc' }
    );
    await handleSetRate(ctxText, exchangeRateService);
    expect(messagesText[0]).toContain('فرمت نرخ وارد شده نامعتبر است');

    const { ctx: ctxFloat, repliedMessages: messagesFloat } = createMockContext(
      { id: adminChatId, username: 'admin_user' },
      { match: '620000.50' }
    );
    await handleSetRate(ctxFloat, exchangeRateService);
    expect(messagesFloat[0]).toContain('فرمت نرخ وارد شده نامعتبر است');

    const [countResult] = await db.select({ value: count() }).from(exchangeRates);
    expect(Number(countResult?.value ?? 0)).toBe(0);
  });

  it('silently ignores update if ctx.from is undefined', async () => {
    const { ctx } = createMockContext(undefined, { match: '620000' });

    await handleSetRate(ctx, exchangeRateService);

    expect(ctx.reply).not.toHaveBeenCalled();
    const [countResult] = await db.select({ value: count() }).from(exchangeRates);
    expect(Number(countResult?.value ?? 0)).toBe(0);
  });

  describe('Bot integration with /setrate', () => {
    function createTestBot() {
      const repliedMessages: string[] = [];
      const { fetch: mockFetch } = createMockFetch(repliedMessages);
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

      return { bot, repliedMessages };
    }

    it('executes /setrate command for Admin via bot.handleUpdate with direct argument', async () => {
      const { bot, repliedMessages } = createTestBot();

      await bot.handleUpdate({
        update_id: 1,
        message: {
          message_id: 1,
          date: Math.floor(Date.now() / 1000),
          chat: { id: adminChatId, type: 'private', first_name: 'Admin' },
          from: { id: adminChatId, is_bot: false, first_name: 'Admin' },
          text: '/setrate 620000',
          entities: [{ offset: 0, length: 8, type: 'bot_command' }],
        },
      });

      expect(repliedMessages).toHaveLength(1);
      expect(repliedMessages[0]).toContain('نرخ جدید با موفقیت تنظیم شد');
      expect(repliedMessages[0]).toContain('620,000');

      const rows = await db.select().from(exchangeRates);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.irrPerUsd).toBe(620000n);
    });

    it('enters conversation when /setrate is called without arguments and saves rate', async () => {
      const { bot, repliedMessages } = createTestBot();

      // 1. Send /setrate without arguments
      await bot.handleUpdate({
        update_id: 10,
        message: {
          message_id: 10,
          date: Math.floor(Date.now() / 1000),
          chat: { id: adminChatId, type: 'private', first_name: 'Admin' },
          from: { id: adminChatId, is_bot: false, first_name: 'Admin' },
          text: '/setrate',
          entities: [{ offset: 0, length: 8, type: 'bot_command' }],
        },
      });

      expect(repliedMessages).toHaveLength(1);
      expect(repliedMessages[0]).toContain('تنظیم نرخ ارز');

      // 2. Admin inputs new rate with comma formatting
      await bot.handleUpdate({
        update_id: 11,
        message: {
          message_id: 11,
          date: Math.floor(Date.now() / 1000),
          chat: { id: adminChatId, type: 'private', first_name: 'Admin' },
          from: { id: adminChatId, is_bot: false, first_name: 'Admin' },
          text: '635,000',
        },
      });

      expect(repliedMessages).toHaveLength(2);
      expect(repliedMessages[1]).toContain('نرخ جدید با موفقیت تنظیم شد');
      expect(repliedMessages[1]).toContain('635,000');

      const rows = await db.select().from(exchangeRates);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.irrPerUsd).toBe(635000n);
    });

    it("enters conversation when clicking '✏️ تنظیم نرخ ارز' menu button", async () => {
      const { bot, repliedMessages } = createTestBot();

      await bot.handleUpdate({
        update_id: 20,
        message: {
          message_id: 20,
          date: Math.floor(Date.now() / 1000),
          chat: { id: adminChatId, type: 'private', first_name: 'Admin' },
          from: { id: adminChatId, is_bot: false, first_name: 'Admin' },
          text: '✏️ تنظیم نرخ ارز',
        },
      });

      expect(repliedMessages).toHaveLength(1);
      expect(repliedMessages[0]).toContain('تنظیم نرخ ارز');

      // Admin sends rate
      await bot.handleUpdate({
        update_id: 21,
        message: {
          message_id: 21,
          date: Math.floor(Date.now() / 1000),
          chat: { id: adminChatId, type: 'private', first_name: 'Admin' },
          from: { id: adminChatId, is_bot: false, first_name: 'Admin' },
          text: '640000',
        },
      });

      expect(repliedMessages).toHaveLength(2);
      expect(repliedMessages[1]).toContain('640,000');
    });

    it('cancels setrate conversation via inline cancel button', async () => {
      const { bot, repliedMessages } = createTestBot();

      // 1. Enter conversation
      await bot.handleUpdate({
        update_id: 30,
        message: {
          message_id: 30,
          date: Math.floor(Date.now() / 1000),
          chat: { id: adminChatId, type: 'private', first_name: 'Admin' },
          from: { id: adminChatId, is_bot: false, first_name: 'Admin' },
          text: '/setrate',
          entities: [{ offset: 0, length: 8, type: 'bot_command' }],
        },
      });

      expect(repliedMessages).toHaveLength(1);

      // 2. Click inline cancel button
      await bot.handleUpdate({
        update_id: 31,
        callback_query: {
          id: 'cb_cancel_rate',
          from: { id: adminChatId, is_bot: false, first_name: 'Admin' },
          chat_instance: 'inst_rate',
          data: 'flow:cancel',
          message: {
            message_id: 1,
            date: Math.floor(Date.now() / 1000),
            chat: { id: adminChatId, type: 'private' },
            text: 'تنظیم نرخ ارز',
          },
        },
      } as any);

      expect(repliedMessages).toHaveLength(2);
      expect(repliedMessages[1]).toContain('لغو شد');

      const [countResult] = await db.select({ value: count() }).from(exchangeRates);
      expect(Number(countResult?.value ?? 0)).toBe(0);
    });

    it('re-prompts on invalid input inside conversation before accepting valid rate', async () => {
      const { bot, repliedMessages } = createTestBot();

      // 1. Enter conversation
      await bot.handleUpdate({
        update_id: 40,
        message: {
          message_id: 40,
          date: Math.floor(Date.now() / 1000),
          chat: { id: adminChatId, type: 'private', first_name: 'Admin' },
          from: { id: adminChatId, is_bot: false, first_name: 'Admin' },
          text: '/setrate',
          entities: [{ offset: 0, length: 8, type: 'bot_command' }],
        },
      });

      // 2. Invalid text
      await bot.handleUpdate({
        update_id: 41,
        message: {
          message_id: 41,
          date: Math.floor(Date.now() / 1000),
          chat: { id: adminChatId, type: 'private', first_name: 'Admin' },
          from: { id: adminChatId, is_bot: false, first_name: 'Admin' },
          text: 'invalid_number',
        },
      });

      expect(repliedMessages).toHaveLength(2);
      expect(repliedMessages[1]).toContain('فرمت نرخ وارد شده نامعتبر است');

      // 3. Valid rate
      await bot.handleUpdate({
        update_id: 42,
        message: {
          message_id: 42,
          date: Math.floor(Date.now() / 1000),
          chat: { id: adminChatId, type: 'private', first_name: 'Admin' },
          from: { id: adminChatId, is_bot: false, first_name: 'Admin' },
          text: '650000',
        },
      });

      expect(repliedMessages).toHaveLength(3);
      expect(repliedMessages[2]).toContain('نرخ جدید با موفقیت تنظیم شد');
      expect(repliedMessages[2]).toContain('650,000');
    });

    it('silently ignores /setrate command when sent by a non-Admin', async () => {
      const nonAdminChatId = 999888777;
      const { bot, repliedMessages } = createTestBot();

      await bot.handleUpdate({
        update_id: 2,
        message: {
          message_id: 2,
          date: Math.floor(Date.now() / 1000),
          chat: { id: nonAdminChatId, type: 'private', first_name: 'Buyer' },
          from: { id: nonAdminChatId, is_bot: false, first_name: 'Buyer' },
          text: '/setrate 620000',
          entities: [{ offset: 0, length: 8, type: 'bot_command' }],
        },
      });

      expect(repliedMessages).toHaveLength(0);
      const [countResult] = await db.select({ value: count() }).from(exchangeRates);
      expect(Number(countResult?.value ?? 0)).toBe(0);
    });
  });
});
