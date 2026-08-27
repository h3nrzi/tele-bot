import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { createMockFetch } from '@tests/helpers/mock-context';
import { createBot } from '@/bot/bot';
import { setRate } from '@/application/exchange-rate/exchange-rate.service';
import { setActiveAccount } from '@/application/bank-account/bank-account.service';
import { topUpRequests } from '@/db/schema/top-up-requests';
import { users } from '@/db/schema/users';
import {
  getTopUpPromptMessage,
  getTopUpUnavailableMessage,
  getTopUpActiveExistsMessage,
  getTopUpCancelledMessage,
  getTopUpSuccessMessage,
  getAdminNoRateAlertMessage,
} from '@/bot/modules/buyer';
import { eq, count } from 'drizzle-orm';
import Decimal from 'decimal.js';

describe('/topup Buyer Command & Conversation Flow', () => {
  const { db } = setupTestDatabase();
  const adminChatId = 111222333;
  const adminChatId2 = 444555666;
  const buyerChatId = 987654321;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.ADMIN_IDS = `${adminChatId},${adminChatId2}`;
    process.env.TOPUP_MIN_USD = '10.00';
    process.env.TOPUP_MAX_USD = '1000.00';
    process.env.TOPUP_INITIATED_EXPIRY_MINUTES = '30';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function makeMessageUpdate(
    updateId: number,
    chatId: number,
    text: string,
    senderName = 'Buyer'
  ) {
    const isCommand = text.startsWith('/');
    const commandLength = text.indexOf(' ') > 0 ? text.indexOf(' ') : text.length;

    const message: Record<string, unknown> = {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: 'private', first_name: senderName },
      from: { id: chatId, is_bot: false, first_name: senderName, username: 'buyer_user' },
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

  function createTestBot() {
    const repliedMessages: string[] = [];
    const { fetch: mockFetch } = createMockFetch(repliedMessages);
    const bot = createBot({
      token: 'test_token',
      dbClient: db,
      adminIds: `${adminChatId},${adminChatId2}`,
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

  it('walks Buyer through happy path /topup flow and creates INITIATED request with card details', async () => {
    // Setup exchange rate and active card
    await setRate(BigInt(adminChatId), 620000n, db);
    const activeCard = await setActiveAccount(
      {
        cardNumber: '6037991234567890',
        cardHolderName: 'Ali Reza',
        bankName: 'Mellat Bank',
        additionalNotes: 'Transfer only from your personal card',
      },
      db
    );

    const { bot, repliedMessages } = createTestBot();

    // Step 1: Send /topup
    await bot.handleUpdate(makeMessageUpdate(1, buyerChatId, '/topup'));

    expect(repliedMessages).toHaveLength(1);
    expect(repliedMessages[0]).toBe(
      getTopUpPromptMessage(new Decimal('10.00'), new Decimal('1000.00'))
    );

    // Step 2: Send USD amount $100
    await bot.handleUpdate(makeMessageUpdate(2, buyerChatId, '100'));

    expect(repliedMessages).toHaveLength(2);
    const confirmation = repliedMessages[1];
    expect(confirmation).toContain('$100.00');
    expect(confirmation).toContain('62,000,000');
    expect(confirmation).toContain('6037991234567890');
    expect(confirmation).toContain('Ali Reza');
    expect(confirmation).toContain('Mellat Bank');
    expect(confirmation).toContain('Transfer only from your personal card');

    // Verify database record
    const allRequests = await db.select().from(topUpRequests);
    expect(allRequests).toHaveLength(1);
    expect(allRequests[0]?.usdAmount).toBe('100.00');
    expect(allRequests[0]?.irrAmount).toBe(62000000n);
    expect(allRequests[0]?.status).toBe('INITIATED');
  });

  it('cancels the topup flow when Buyer sends /cancel', async () => {
    await setRate(BigInt(adminChatId), 620000n, db);
    await setActiveAccount(
      {
        cardNumber: '6037991234567890',
        cardHolderName: 'Ali Reza',
        bankName: 'Mellat Bank',
      },
      db
    );

    const { bot, repliedMessages } = createTestBot();

    await bot.handleUpdate(makeMessageUpdate(1, buyerChatId, '/topup'));
    expect(repliedMessages).toHaveLength(1);

    await bot.handleUpdate(makeMessageUpdate(2, buyerChatId, '/cancel'));
    expect(repliedMessages).toHaveLength(2);
    expect(repliedMessages[1]).toBe(getTopUpCancelledMessage());

    const [countRes] = await db.select({ value: count() }).from(topUpRequests);
    expect(Number(countRes?.value ?? 0)).toBe(0);
  });

  it('re-prompts on invalid string, below min amount, and above max amount', async () => {
    await setRate(BigInt(adminChatId), 620000n, db);
    await setActiveAccount(
      {
        cardNumber: '6037991234567890',
        cardHolderName: 'Ali Reza',
        bankName: 'Mellat Bank',
      },
      db
    );

    const { bot, repliedMessages } = createTestBot();

    await bot.handleUpdate(makeMessageUpdate(1, buyerChatId, '/topup'));
    expect(repliedMessages).toHaveLength(1);

    // Invalid non-number input
    await bot.handleUpdate(makeMessageUpdate(2, buyerChatId, 'fifty'));
    expect(repliedMessages).toHaveLength(2);
    expect(repliedMessages[1]).toContain('/cancel');

    // Below min input
    await bot.handleUpdate(makeMessageUpdate(3, buyerChatId, '5'));
    expect(repliedMessages).toHaveLength(3);
    expect(repliedMessages[2]).toContain('$10.00');

    // Above max input
    await bot.handleUpdate(makeMessageUpdate(4, buyerChatId, '1500'));
    expect(repliedMessages).toHaveLength(4);
    expect(repliedMessages[3]).toContain('$1000.00');

    // Valid input
    await bot.handleUpdate(makeMessageUpdate(5, buyerChatId, '50.00'));
    expect(repliedMessages).toHaveLength(5);
    expect(repliedMessages[4]).toContain('$50.00');
    expect(repliedMessages[4]).toContain('31,000,000');

    const allRequests = await db.select().from(topUpRequests);
    expect(allRequests).toHaveLength(1);
    expect(allRequests[0]?.usdAmount).toBe('50.00');
  });

  it('handles no exchange rate configured: replies unavailable to Buyer and pushes urgent alert to all Admins', async () => {
    await setActiveAccount(
      {
        cardNumber: '6037991234567890',
        cardHolderName: 'Ali Reza',
        bankName: 'Mellat Bank',
      },
      db
    );

    const { bot, repliedMessages } = createTestBot();

    await bot.handleUpdate(makeMessageUpdate(1, buyerChatId, '/topup'));

    // Buyer receives unavailable message
    expect(repliedMessages).toContain(getTopUpUnavailableMessage());

    // Both admins receive urgent alert
    const adminAlerts = repliedMessages.filter((msg) =>
      msg.includes(getAdminNoRateAlertMessage()) || msg.includes('/setrate')
    );
    expect(adminAlerts).toHaveLength(2);

    // No topup request created
    const [countRes] = await db.select({ value: count() }).from(topUpRequests);
    expect(Number(countRes?.value ?? 0)).toBe(0);
  });

  it('refuses /topup if Buyer already has an active INITIATED request', async () => {
    await setRate(BigInt(adminChatId), 620000n, db);
    await setActiveAccount(
      {
        cardNumber: '6037991234567890',
        cardHolderName: 'Ali Reza',
        bankName: 'Mellat Bank',
      },
      db
    );

    const { bot, repliedMessages } = createTestBot();

    // First topup
    await bot.handleUpdate(makeMessageUpdate(1, buyerChatId, '/topup'));
    await bot.handleUpdate(makeMessageUpdate(2, buyerChatId, '50'));
    expect(repliedMessages).toHaveLength(2);

    // Second /topup attempt while first is still INITIATED
    await bot.handleUpdate(makeMessageUpdate(3, buyerChatId, '/topup'));
    expect(repliedMessages).toHaveLength(3);
    expect(repliedMessages[2]).toBe(getTopUpActiveExistsMessage());

    const allRequests = await db.select().from(topUpRequests);
    expect(allRequests).toHaveLength(1);
  });

  it('refuses /topup if Buyer already has an active PENDING request', async () => {
    await setRate(BigInt(adminChatId), 620000n, db);
    await setActiveAccount(
      {
        cardNumber: '6037991234567890',
        cardHolderName: 'Ali Reza',
        bankName: 'Mellat Bank',
      },
      db
    );

    const { bot, repliedMessages } = createTestBot();

    // Create first request
    await bot.handleUpdate(makeMessageUpdate(1, buyerChatId, '/topup'));
    await bot.handleUpdate(makeMessageUpdate(2, buyerChatId, '50'));

    // Transition request to PENDING
    const [created] = await db.select().from(topUpRequests);
    await db
      .update(topUpRequests)
      .set({ status: 'PENDING' })
      .where(eq(topUpRequests.id, created!.id));

    // Attempt second /topup
    await bot.handleUpdate(makeMessageUpdate(3, buyerChatId, '/topup'));
    expect(repliedMessages).toHaveLength(3);
    expect(repliedMessages[2]).toBe(getTopUpActiveExistsMessage());
  });

  it('fails bot creation / startup when TOPUP_MIN_USD or TOPUP_MAX_USD is missing', () => {
    delete process.env.TOPUP_MIN_USD;
    expect(() => createBot({ token: 'test_token', dbClient: db })).toThrow(
      /TOPUP_MIN_USD and TOPUP_MAX_USD environment variables are required/i
    );
  });
});
