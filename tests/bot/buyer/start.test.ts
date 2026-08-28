import { describe, it, expect } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { createMockContext } from '@tests/helpers/mock-context';
import {
  handleStart,
  getNewBuyerWelcomeMessage,
  getReturningBuyerWelcomeMessage,
} from '@/bot/handlers/buyer';
import { createBot } from '@/bot/bot';
import { users } from '@/modules/buyer/buyer.schema';
import { wallets } from '@/modules/wallet/wallet.schema';
import { eq } from 'drizzle-orm';

describe('/start Handler', () => {
  const { db } = setupTestDatabase();

  it('sends welcome message for a new Buyer confirming Wallet creation with $0.00 Available Balance', async () => {
    const { ctx, repliedMessages } = createMockContext({
      id: 123456789,
      first_name: 'Alice',
      username: 'alice_buyer',
    });

    await handleStart(ctx, db);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(repliedMessages[0]).toContain('Tele-Bot');
    expect(repliedMessages[0]).toContain('$0.00');
    expect(repliedMessages[0]).toBe(getNewBuyerWelcomeMessage());

    // Verify Buyer and Wallet in database
    const dbUsers = await db.select().from(users).where(eq(users.telegramChatId, 123456789n));
    expect(dbUsers).toHaveLength(1);
    const dbWallets = await db.select().from(wallets).where(eq(wallets.userId, dbUsers[0]!.id));
    expect(dbWallets).toHaveLength(1);
    expect(dbWallets[0]!.availableBalance).toBe('0.00');
  });

  it('sends personalised message with current Available Balance for a returning Buyer', async () => {
    const chatId = 987654321;
    const { ctx, repliedMessages } = createMockContext({
      id: chatId,
      first_name: 'Bob',
      username: 'bob_buyer',
    });

    // First call: registers new Buyer
    await handleStart(ctx, db);
    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(repliedMessages[0]).toBe(getNewBuyerWelcomeMessage());

    // Update wallet balance to simulate previous activity
    const [buyer] = await db.select().from(users).where(eq(users.telegramChatId, BigInt(chatId)));
    await db
      .update(wallets)
      .set({ availableBalance: '150.75' })
      .where(eq(wallets.userId, buyer!.id));

    // Second call: returning Buyer
    await handleStart(ctx, db);

    expect(ctx.reply).toHaveBeenCalledTimes(2);
    expect(repliedMessages[1]).toContain('Bob');
    expect(repliedMessages[1]).toContain('$150.75');
    expect(repliedMessages[1]).toBe(getReturningBuyerWelcomeMessage('Bob', '150.75'));
  });

  it('falls back to @username when first_name is not provided for returning Buyer', async () => {
    const chatId = 445566778;
    const { ctx, repliedMessages } = createMockContext({
      id: chatId,
      first_name: '',
      username: 'charlie',
    });

    // Initial registration
    await handleStart(ctx, db);

    // Returning call
    await handleStart(ctx, db);

    expect(ctx.reply).toHaveBeenCalledTimes(2);
    expect(repliedMessages[1]).toContain('@charlie');
    expect(repliedMessages[1]).toContain('$0.00');
    expect(repliedMessages[1]).toBe(getReturningBuyerWelcomeMessage('@charlie', '0.00'));
  });

  it('silently ignores update if ctx.from is undefined', async () => {
    const { ctx } = createMockContext(undefined);

    await handleStart(ctx, db);

    expect(ctx.reply).not.toHaveBeenCalled();
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

  it('sends Admin welcome panel message when /start is sent by an Admin', async () => {
    const adminChatId = 999111222;
    const { ctx, repliedMessages } = createMockContext({
      id: adminChatId,
      first_name: 'AdminBoss',
      username: 'admin_boss',
    });

    await handleStart(ctx, db, { adminIds: `${adminChatId}` });

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(repliedMessages[0]).toContain('پنل مدیریت');
    expect(repliedMessages[0]).toContain('AdminBoss');
  });
});

