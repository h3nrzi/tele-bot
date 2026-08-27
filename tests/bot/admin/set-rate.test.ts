import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDatabase } from '../../helpers/test-db';
import { createMockContext } from '../../helpers/mock-context';
import {
  handleSetRate,
  getSetRateSuccessMessage,
  getSetRateUsageErrorMessage,
} from '../../../src/bot/modules/admin';
import { createBot } from '../../../src/bot/bot';
import { exchangeRates } from '../../../src/db/schema/exchange-rates';
import { count } from 'drizzle-orm';

describe('/setrate Handler', () => {
  const { db } = setupTestDatabase();
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

    await handleSetRate(ctx, db);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(repliedMessages[0]).toBe(getSetRateSuccessMessage(620000n));
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

    await handleSetRate(ctx, db);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(repliedMessages[0]).toBe(getSetRateSuccessMessage(650000n));

    const rows = await db.select().from(exchangeRates);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.irrPerUsd).toBe(650000n);
  });

  it('extracts argument from message text if ctx.match is not set', async () => {
    const { ctx, repliedMessages } = createMockContext(
      { id: adminChatId, username: 'admin_user' },
      { text: '/setrate 700000' }
    );

    await handleSetRate(ctx, db);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(repliedMessages[0]).toBe(getSetRateSuccessMessage(700000n));

    const rows = await db.select().from(exchangeRates);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.irrPerUsd).toBe(700000n);
  });

  it('replies with usage error and does not insert row when argument is missing', async () => {
    const { ctx, repliedMessages } = createMockContext(
      { id: adminChatId, username: 'admin_user' },
      { match: '' }
    );

    await handleSetRate(ctx, db);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(repliedMessages[0]).toBe(getSetRateUsageErrorMessage());

    const [countResult] = await db.select({ value: count() }).from(exchangeRates);
    expect(Number(countResult?.value ?? 0)).toBe(0);
  });

  it('replies with usage error and does not insert row when argument is 0', async () => {
    const { ctx, repliedMessages } = createMockContext(
      { id: adminChatId, username: 'admin_user' },
      { match: '0' }
    );

    await handleSetRate(ctx, db);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(repliedMessages[0]).toBe(getSetRateUsageErrorMessage());

    const [countResult] = await db.select({ value: count() }).from(exchangeRates);
    expect(Number(countResult?.value ?? 0)).toBe(0);
  });

  it('replies with usage error and does not insert row when argument is negative', async () => {
    const { ctx, repliedMessages } = createMockContext(
      { id: adminChatId, username: 'admin_user' },
      { match: '-50000' }
    );

    await handleSetRate(ctx, db);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(repliedMessages[0]).toBe(getSetRateUsageErrorMessage());

    const [countResult] = await db.select({ value: count() }).from(exchangeRates);
    expect(Number(countResult?.value ?? 0)).toBe(0);
  });

  it('replies with usage error and does not insert row when argument is non-numeric or float', async () => {
    const { ctx: ctxText, repliedMessages: messagesText } = createMockContext(
      { id: adminChatId, username: 'admin_user' },
      { match: 'abc' }
    );
    await handleSetRate(ctxText, db);
    expect(messagesText[0]).toBe(getSetRateUsageErrorMessage());

    const { ctx: ctxFloat, repliedMessages: messagesFloat } = createMockContext(
      { id: adminChatId, username: 'admin_user' },
      { match: '620000.50' }
    );
    await handleSetRate(ctxFloat, db);
    expect(messagesFloat[0]).toBe(getSetRateUsageErrorMessage());

    const [countResult] = await db.select({ value: count() }).from(exchangeRates);
    expect(Number(countResult?.value ?? 0)).toBe(0);
  });

  it('silently ignores update if ctx.from is undefined', async () => {
    const { ctx } = createMockContext(undefined, { match: '620000' });

    await handleSetRate(ctx, db);

    expect(ctx.reply).not.toHaveBeenCalled();
    const [countResult] = await db.select({ value: count() }).from(exchangeRates);
    expect(Number(countResult?.value ?? 0)).toBe(0);
  });

  describe('Bot integration with /setrate', () => {
    it('executes /setrate command for Admin via bot.handleUpdate', async () => {
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

      const repliedMessages: string[] = [];
      bot.api.config.use(async (prev: any, method: string, payload: any, signal: any) => {
        if (method === 'sendMessage') {
          repliedMessages.push(payload.text);
          return {
            ok: true,
            result: {
              message_id: 1,
              date: Date.now(),
              chat: { id: payload.chat_id, type: 'private' },
              text: payload.text,
            },
          } as any;
        }
        return prev(method, payload, signal);
      });

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
      expect(repliedMessages[0]).toBe(getSetRateSuccessMessage(620000n));

      const rows = await db.select().from(exchangeRates);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.irrPerUsd).toBe(620000n);
    });

    it('silently ignores /setrate command when sent by a non-Admin', async () => {
      const nonAdminChatId = 999888777;
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

      const repliedMessages: string[] = [];
      bot.api.config.use(async (prev: any, method: string, payload: any, signal: any) => {
        if (method === 'sendMessage') {
          repliedMessages.push(payload.text);
          return {
            ok: true,
            result: {
              message_id: 1,
              date: Date.now(),
              chat: { id: payload.chat_id, type: 'private' },
              text: payload.text,
            },
          } as any;
        }
        return prev(method, payload, signal);
      });

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
