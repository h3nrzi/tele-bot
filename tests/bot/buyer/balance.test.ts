import { describe, it, expect } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { createMockContext } from '@tests/helpers/mock-context';
import {
  handleBalance,
  getBalanceMessage,
  getUnregisteredBalanceMessage,
} from '@/bot/modules/buyer';
import { createBot } from '@/bot/bot';
import { registerBuyer } from '@/application/buyer/registration.service';
import { wallets } from '@/db/schema/wallets';
import { eq } from 'drizzle-orm';

describe('/balance Handler', () => {
  const { db } = setupTestDatabase();

  it('returns Available Balance formatted as a USD string ($0.00) for a registered Buyer', async () => {
    const chatId = 123456789;
    await registerBuyer(
      {
        telegramChatId: chatId,
        telegramUsername: 'alice_buyer',
      },
      db
    );

    const { ctx, repliedMessages } = createMockContext({
      id: chatId,
      first_name: 'Alice',
      username: 'alice_buyer',
    });

    await handleBalance(ctx, db);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(repliedMessages[0]).toBe(getBalanceMessage('0.00'));
    expect(repliedMessages[0]).toContain('$0.00');
  });

  it('returns non-zero Available Balance formatted as a USD string for a registered Buyer', async () => {
    const chatId = 987654321;
    const { buyer } = await registerBuyer(
      {
        telegramChatId: chatId,
        telegramUsername: 'bob_buyer',
      },
      db
    );

    await db
      .update(wallets)
      .set({ availableBalance: '123.45' })
      .where(eq(wallets.userId, buyer.id));

    const { ctx, repliedMessages } = createMockContext({
      id: chatId,
      first_name: 'Bob',
      username: 'bob_buyer',
    });

    await handleBalance(ctx, db);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(repliedMessages[0]).toBe(getBalanceMessage('123.45'));
    expect(repliedMessages[0]).toContain('$123.45');
  });

  it('prompts unregistered sender to send /start first when calling /balance before registration', async () => {
    const { ctx, repliedMessages } = createMockContext({
      id: 555444333,
      first_name: 'Unregistered',
      username: 'unregistered_user',
    });

    await handleBalance(ctx, db);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(repliedMessages[0]).toBe(getUnregisteredBalanceMessage());
    expect(repliedMessages[0]).toContain('/start');
  });

  it('silently ignores update if ctx.from is undefined', async () => {
    const { ctx } = createMockContext(undefined);

    await handleBalance(ctx, db);

    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('handles /balance command via createBot and bot.handleUpdate', async () => {
    const chatId = 777888999;
    await registerBuyer(
      {
        telegramChatId: chatId,
        telegramUsername: 'dana_buyer',
      },
      db
    );

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
        chat: { id: chatId, type: 'private', first_name: 'Dana' },
        from: { id: chatId, is_bot: false, first_name: 'Dana' },
        text: '/balance',
        entities: [{ offset: 0, length: 8, type: 'bot_command' }],
      },
    });

    expect(repliedMessages).toHaveLength(1);
    expect(repliedMessages[0]).toBe(getBalanceMessage('0.00'));
  });
});
