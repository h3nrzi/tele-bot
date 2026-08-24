import { describe, it, expect, vi } from 'vitest';
import type { Context } from 'grammy';
import { setupTestDatabase } from '../helpers/test-db';
import { handleStart, getNewBuyerWelcomeMessage, getReturningBuyerWelcomeMessage } from '../../src/bot/handlers/start';
import { createBot } from '../../src/bot/bot';
import { users } from '../../src/db/schema/users';
import { wallets } from '../../src/db/schema/wallets';
import { eq } from 'drizzle-orm';

describe('/start Handler', () => {
  const { db } = setupTestDatabase();

  it('sends welcome message for a new Buyer confirming account creation with $0.00 Available Balance', async () => {
    const repliedMessages: string[] = [];
    const mockCtx = {
      from: {
        id: 123456789,
        is_bot: false,
        first_name: 'Alice',
        username: 'alice_buyer',
      },
      reply: vi.fn(async (text: string) => {
        repliedMessages.push(text);
      }),
    } as unknown as Context;

    await handleStart(mockCtx, db);

    expect(mockCtx.reply).toHaveBeenCalledTimes(1);
    expect(repliedMessages[0]).toContain('Welcome');
    expect(repliedMessages[0]).toContain('$0.00');
    expect(repliedMessages[0]).toBe(getNewBuyerWelcomeMessage());

    // Verify user and wallet in database
    const dbUsers = await db.select().from(users).where(eq(users.telegramChatId, 123456789n));
    expect(dbUsers).toHaveLength(1);
    const dbWallets = await db.select().from(wallets).where(eq(wallets.userId, dbUsers[0]!.id));
    expect(dbWallets).toHaveLength(1);
    expect(dbWallets[0]!.availableBalance).toBe('0.00');
  });

  it('sends personalised message with current Available Balance for a returning Buyer', async () => {
    const chatId = 987654321;
    const repliedMessages: string[] = [];
    const mockCtx = {
      from: {
        id: chatId,
        is_bot: false,
        first_name: 'Bob',
        username: 'bob_buyer',
      },
      reply: vi.fn(async (text: string) => {
        repliedMessages.push(text);
      }),
    } as unknown as Context;

    // First call: registers new buyer
    await handleStart(mockCtx, db);
    expect(mockCtx.reply).toHaveBeenCalledTimes(1);
    expect(repliedMessages[0]).toBe(getNewBuyerWelcomeMessage());

    // Update wallet balance to simulate previous activity
    const [user] = await db.select().from(users).where(eq(users.telegramChatId, BigInt(chatId)));
    await db
      .update(wallets)
      .set({ availableBalance: '150.75' })
      .where(eq(wallets.userId, user!.id));

    // Second call: returning buyer
    vi.clearAllMocks();
    await handleStart(mockCtx, db);

    expect(mockCtx.reply).toHaveBeenCalledTimes(1);
    expect(repliedMessages[1]).toContain('Bob');
    expect(repliedMessages[1]).toContain('$150.75');
    expect(repliedMessages[1]).toBe(getReturningBuyerWelcomeMessage('Bob', '150.75'));
  });

  it('falls back to @username when first_name is not provided for returning Buyer', async () => {
    const chatId = 445566778;
    const repliedMessages: string[] = [];
    const mockCtx = {
      from: {
        id: chatId,
        is_bot: false,
        first_name: '',
        username: 'charlie',
      },
      reply: vi.fn(async (text: string) => {
        repliedMessages.push(text);
      }),
    } as unknown as Context;

    // Initial registration
    await handleStart(mockCtx, db);

    // Returning call
    vi.clearAllMocks();
    await handleStart(mockCtx, db);

    expect(mockCtx.reply).toHaveBeenCalledTimes(1);
    expect(repliedMessages[1]).toContain('@charlie');
    expect(repliedMessages[1]).toContain('$0.00');
    expect(repliedMessages[1]).toBe(getReturningBuyerWelcomeMessage('@charlie', '0.00'));
  });

  it('silently ignores update if ctx.from is undefined', async () => {
    const mockCtx = {
      from: undefined,
      reply: vi.fn(),
    } as unknown as Context;

    await handleStart(mockCtx, db);

    expect(mockCtx.reply).not.toHaveBeenCalled();
  });

  it('handles /start command via createBot and bot.handleUpdate', async () => {
    const bot = createBot({
      token: 'test_token',
      dbClient: db,
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
        chat: { id: 777888999, type: 'private', first_name: 'Dana' },
        from: { id: 777888999, is_bot: false, first_name: 'Dana' },
        text: '/start',
        entities: [{ offset: 0, length: 6, type: 'bot_command' }],
      },
    });

    expect(repliedMessages).toHaveLength(1);
    expect(repliedMessages[0]).toBe(getNewBuyerWelcomeMessage());
  });
});
