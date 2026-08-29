import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { createMockContext } from '@tests/helpers/mock-context';
import {
  handleCancelCommand,
  getCancelSuccessMessage,
  getCannotCancelPendingMessage,
  getNoActiveRequestToCancelMessage,
} from '@/bot/handlers/buyer';
import { BuyerService } from '@/modules/buyer/buyer.service';
import { createBot } from '@/bot/bot';
import {
  createTestBuyer,
  setTestRate,
  initiateTestTopUp,
} from '@tests/helpers/fixtures';
import { TopUpService } from '@/modules/top-up/top-up.service';
import { topUpRequests } from '@/modules/top-up/top-up.schema';
import { eq } from 'drizzle-orm';

describe('/cancel Command Handler', () => {
  const { db, container } = setupTestDatabase();
  const buyerService = container.resolve(BuyerService);
  const topUpService = container.resolve(TopUpService);
  const cancelDeps = { buyerService, topUpService };
  const adminId = 123456789n;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.TOPUP_MIN_USD = '10.00';
    process.env.TOPUP_MAX_USD = '1000.00';
    process.env.TOPUP_INITIATED_EXPIRY_MINUTES = '30';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('cancels INITIATED top-up request and replies with cancellation confirmation message', async () => {
    const chatId = 111222333;
    const { buyer } = await createTestBuyer(
      container,
      { telegramChatId: chatId, telegramUsername: 'alice_buyer' }
    );
    await setTestRate(container, adminId, 620000n);
    const initResult = await initiateTestTopUp(container, { userId: buyer.id, usdAmount: '50.00' });

    const { ctx, repliedMessages } = createMockContext({
      id: chatId,
      first_name: 'Alice',
      username: 'alice_buyer',
    });

    await handleCancelCommand(ctx, cancelDeps);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(repliedMessages[0]).toBe(getCancelSuccessMessage());

    // Verify DB status is CANCELLED
    const [row] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, initResult.request.id));
    expect(row?.status).toBe('CANCELLED');
  });

  it('informs buyer that cancellation is not possible when request is PENDING', async () => {
    const chatId = 222333444;
    const { buyer } = await createTestBuyer(
      container,
      { telegramChatId: chatId, telegramUsername: 'bob_buyer' }
    );
    await setTestRate(container, adminId, 620000n);
    const initResult = await initiateTestTopUp(container, { userId: buyer.id, usdAmount: '100.00' });
    const topUpService = container.resolve(TopUpService);
    await topUpService.submitReceipt({ userId: buyer.id, fileId: 'receipt_photo_1' });

    const { ctx, repliedMessages } = createMockContext({
      id: chatId,
      first_name: 'Bob',
      username: 'bob_buyer',
    });

    await handleCancelCommand(ctx, cancelDeps);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(repliedMessages[0]).toBe(getCannotCancelPendingMessage());

    // Verify DB status remains PENDING
    const [row] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, initResult.request.id));
    expect(row?.status).toBe('PENDING');
  });

  it('informs buyer when there is no active top-up request to cancel', async () => {
    const chatId = 333444555;
    const { buyer } = await createTestBuyer(
      container,
      { telegramChatId: chatId, telegramUsername: 'charlie_buyer' }
    );

    const { ctx, repliedMessages } = createMockContext({
      id: chatId,
      first_name: 'Charlie',
      username: 'charlie_buyer',
    });

    await handleCancelCommand(ctx, cancelDeps);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(repliedMessages[0]).toBe(getNoActiveRequestToCancelMessage());
  });

  it('silently ignores /cancel for unregistered sender (no users row)', async () => {
    const { ctx } = createMockContext({
      id: 999888777,
      first_name: 'Unknown',
      username: 'unknown_user',
    });

    await handleCancelCommand(ctx, cancelDeps);

    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('silently ignores update if ctx.from is undefined', async () => {
    const { ctx } = createMockContext(undefined);

    await handleCancelCommand(ctx, cancelDeps);

    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('handles /cancel command via createBot and bot.handleUpdate', async () => {
    const chatId = 444555666;
    const { buyer } = await createTestBuyer(
      container,
      { telegramChatId: chatId, telegramUsername: 'dana_buyer' }
    );
    await setTestRate(container, adminId, 620000n);
    await initiateTestTopUp(container, { userId: buyer.id, usdAmount: '75.00' });

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
        text: '/cancel',
        entities: [{ offset: 0, length: 7, type: 'bot_command' }],
      },
    });

    expect(repliedMessages).toHaveLength(1);
    expect(repliedMessages[0]).toBe(getCancelSuccessMessage());
  });
});
