import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { createMockFetch } from '@tests/helpers/mock-context';
import { createBot } from '@/bot/bot';
import { setTestRate, setTestActiveAccount } from '@tests/helpers/fixtures';
import { topUpRequests } from '@/modules/top-up/top-up.schema';
import { ExchangeRateConfigService } from '@/modules/exchange-rate/exchange-rate-config.service';
import type { WallexClient } from '@/modules/wallex/wallex.client.interface';
import { WallexNetworkError } from '@/modules/wallex/wallex.errors';
import { TOKENS } from '@/core/di/tokens';
import { eq, count } from 'drizzle-orm';

describe('/topup Buyer Command & Conversation Flow', () => {
  const { db, container } = setupTestDatabase();
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

  function createTestBot(options?: { wallexClient?: WallexClient }) {
    if (options?.wallexClient) {
      container.register(TOKENS.WallexClient, { useValue: options.wallexClient });
    }
    const repliedMessages: string[] = [];
    const { fetch: mockFetch } = createMockFetch(repliedMessages);
    const bot = createBot({
      token: 'test_token',
      container,
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

  it('walks Buyer through happy path /topup flow and creates INITIATED request with Bank Account details', async () => {
    // Setup exchange rate and active card
    await setTestRate(container, BigInt(adminChatId), 620000n);
    await setTestActiveAccount(
      container,
      {
        cardNumber: '6037991234567890',
        cardHolderName: 'Ali Reza',
        bankName: 'Mellat Bank',
        additionalNotes: 'Transfer only from your personal card',
      }
    );

    const { bot, repliedMessages } = createTestBot();

    // Step 1: Send /topup
    await bot.handleUpdate(makeMessageUpdate(1, buyerChatId, '/topup'));

    expect(repliedMessages).toHaveLength(1);
    expect(repliedMessages[0]).toContain('لطفاً مبلغ مورد نظر برای افزایش موجودی');
    expect(repliedMessages[0]).toContain('$10.00');
    expect(repliedMessages[0]).toContain('$1000.00');

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
    await setTestRate(container, BigInt(adminChatId), 620000n);
    await setTestActiveAccount(
      container,
      {
        cardNumber: '6037991234567890',
        cardHolderName: 'Ali Reza',
        bankName: 'Mellat Bank',
      }
    );

    const { bot, repliedMessages } = createTestBot();

    await bot.handleUpdate(makeMessageUpdate(1, buyerChatId, '/topup'));
    expect(repliedMessages).toHaveLength(1);

    await bot.handleUpdate(makeMessageUpdate(2, buyerChatId, '/cancel'));
    expect(repliedMessages).toHaveLength(2);
    expect(repliedMessages[1]).toContain('لغو شد');

    const [countRes] = await db.select({ value: count() }).from(topUpRequests);
    expect(Number(countRes?.value ?? 0)).toBe(0);
  });

  it('cancels the topup flow when Buyer clicks inline cancel button', async () => {
    await setTestRate(container, BigInt(adminChatId), 620000n);
    await setTestActiveAccount(
      container,
      {
        cardNumber: '6037991234567890',
        cardHolderName: 'Ali Reza',
        bankName: 'Mellat Bank',
      }
    );

    const { bot, repliedMessages } = createTestBot();

    await bot.handleUpdate(makeMessageUpdate(1, buyerChatId, '/topup'));
    expect(repliedMessages).toHaveLength(1);

    await bot.handleUpdate({
      update_id: 2,
      callback_query: {
        id: 'cb_cancel_1',
        from: { id: buyerChatId, is_bot: false, first_name: 'Buyer' },
        chat_instance: 'instance_1',
        data: 'flow:cancel',
        message: {
          message_id: 1,
          date: Math.floor(Date.now() / 1000),
          chat: { id: buyerChatId, type: 'private' },
          text: 'لطفاً مبلغ مورد نظر برای افزایش موجودی به دلار را وارد کنید',
        },
      },
    } as any);

    expect(repliedMessages).toHaveLength(2);
    expect(repliedMessages[1]).toContain('لغو شد');

    const [countRes] = await db.select({ value: count() }).from(topUpRequests);
    expect(Number(countRes?.value ?? 0)).toBe(0);
  });

  it('re-prompts on invalid string, below min amount, and above max amount', async () => {
    await setTestRate(container, BigInt(adminChatId), 620000n);
    await setTestActiveAccount(
      container,
      {
        cardNumber: '6037991234567890',
        cardHolderName: 'Ali Reza',
        bankName: 'Mellat Bank',
      }
    );

    const { bot, repliedMessages } = createTestBot();

    await bot.handleUpdate(makeMessageUpdate(1, buyerChatId, '/topup'));
    expect(repliedMessages).toHaveLength(1);

    // Invalid non-number input
    await bot.handleUpdate(makeMessageUpdate(2, buyerChatId, 'fifty'));
    expect(repliedMessages).toHaveLength(2);
    expect(repliedMessages[1]).toContain('مبلغ معتبر');

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
    await setTestActiveAccount(
      container,
      {
        cardNumber: '6037991234567890',
        cardHolderName: 'Ali Reza',
        bankName: 'Mellat Bank',
      }
    );

    const { bot, repliedMessages } = createTestBot();

    await bot.handleUpdate(makeMessageUpdate(1, buyerChatId, '/topup'));

    // Buyer receives unavailable message
    expect(repliedMessages.some((msg) => msg.includes('موقتاً در دسترس نیست'))).toBe(true);

    // Both admins receive urgent alert
    const adminAlerts = repliedMessages.filter((msg) =>
      msg.includes('فوری') && msg.includes('/setrate')
    );
    expect(adminAlerts).toHaveLength(2);

    // No topup request created
    const [countRes] = await db.select({ value: count() }).from(topUpRequests);
    expect(Number(countRes?.value ?? 0)).toBe(0);
  });

  it('refuses /topup if Buyer already has an active INITIATED request', async () => {
    await setTestRate(container, BigInt(adminChatId), 620000n);
    await setTestActiveAccount(
      container,
      {
        cardNumber: '6037991234567890',
        cardHolderName: 'Ali Reza',
        bankName: 'Mellat Bank',
      }
    );

    const { bot, repliedMessages } = createTestBot();

    // First topup
    await bot.handleUpdate(makeMessageUpdate(1, buyerChatId, '/topup'));
    await bot.handleUpdate(makeMessageUpdate(2, buyerChatId, '50'));
    expect(repliedMessages).toHaveLength(2);

    // Second /topup attempt while first is still INITIATED
    await bot.handleUpdate(makeMessageUpdate(3, buyerChatId, '/topup'));
    expect(repliedMessages).toHaveLength(3);
    expect(repliedMessages[2]).toContain('یک درخواست افزایش موجودی فعال دارید');

    const allRequests = await db.select().from(topUpRequests);
    expect(allRequests).toHaveLength(1);
  });

  it('refuses /topup if Buyer already has an active PENDING request', async () => {
    await setTestRate(container, BigInt(adminChatId), 620000n);
    await setTestActiveAccount(
      container,
      {
        cardNumber: '6037991234567890',
        cardHolderName: 'Ali Reza',
        bankName: 'Mellat Bank',
      }
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
    expect(repliedMessages[2]).toContain('یک درخواست افزایش موجودی فعال دارید');
  });

  it('initiates top-up in AUTO_SYNC mode and renders clean invoice with OTC-sourced rate without live market disclosure', async () => {
    // 1. Setup active bank account
    await setTestActiveAccount(
      container,
      {
        cardNumber: '6037991234567890',
        cardHolderName: 'Ali Reza',
        bankName: 'Mellat Bank',
      }
    );

    // 2. Configure AUTO_SYNC mode with 1.50% spread
    const configService = container.resolve(ExchangeRateConfigService);
    await configService.updateConfig({
      mode: 'AUTO_SYNC',
      spreadPercent: '1.50',
    });

    // 3. Mock Wallex OTC quote: 905,000 IRR (90,500 TMN)
    const mockWallexClient: WallexClient = {
      getOtcPrice: vi.fn().mockResolvedValue({
        symbol: 'USDTTMN',
        side: 'BUY',
        priceIrr: 905000n,
      }),
      placeOtcOrder: vi.fn(),
    };

    const { bot, repliedMessages } = createTestBot({ wallexClient: mockWallexClient });

    // Step 1: /topup
    await bot.handleUpdate(makeMessageUpdate(1, buyerChatId, '/topup'));
    expect(repliedMessages).toHaveLength(1);

    // Step 2: USD amount 100
    await bot.handleUpdate(makeMessageUpdate(2, buyerChatId, '100'));
    expect(repliedMessages).toHaveLength(2);

    const invoice = repliedMessages[1];
    // Expected rate: 905,000 * 1.015 = 918,575 IRR
    // Expected IRR total: 100 * 918,575 = 91,857,500 IRR
    expect(invoice).toContain('$100.00');
    expect(invoice).toContain('918,575');
    expect(invoice).toContain('91,857,500');
    expect(invoice).toContain('6037991234567890');
    expect(invoice).toContain('Ali Reza');
    expect(invoice).toContain('Mellat Bank');

    // Verify NO disclosure of rate source or live market label
    expect(invoice).not.toContain('والکس');
    expect(invoice).not.toContain('OTC');
    expect(invoice).not.toContain('زنده');
    expect(invoice).not.toContain('اسپرد');

    // Verify database row
    const [requestRow] = await db.select().from(topUpRequests);
    expect(requestRow).toBeDefined();
    expect(requestRow!.usdAmount).toBe('100.00');
    expect(requestRow!.irrAmount).toBe(91857500n);
    expect(requestRow!.lockedIrrPerUsd).toBe(918575n);
    expect(requestRow!.rateSource).toBe('OTC_QUOTE');
    expect(requestRow!.exchangeRateId).toBeNull();
    expect(requestRow!.status).toBe('INITIATED');
  });

  it('initiates top-up in AUTO_SYNC mode with baseline fallback when Wallex OTC quote fails', async () => {
    // 1. Setup active bank account & baseline exchange rate
    await setTestActiveAccount(
      container,
      {
        cardNumber: '6037991234567890',
        cardHolderName: 'Ali Reza',
        bankName: 'Mellat Bank',
      }
    );
    const baselineRate = await setTestRate(container, BigInt(adminChatId), 620000n);

    // 2. Configure AUTO_SYNC mode with 2.00% spread
    const configService = container.resolve(ExchangeRateConfigService);
    await configService.updateConfig({
      mode: 'AUTO_SYNC',
      spreadPercent: '2.00',
    });

    // 3. Mock Wallex OTC quote failure
    const mockWallexClient: WallexClient = {
      getOtcPrice: vi.fn().mockRejectedValue(
        new WallexNetworkError('Wallex connection refused')
      ),
      placeOtcOrder: vi.fn(),
    };

    const { bot, repliedMessages } = createTestBot({ wallexClient: mockWallexClient });

    await bot.handleUpdate(makeMessageUpdate(1, buyerChatId, '/topup'));
    await bot.handleUpdate(makeMessageUpdate(2, buyerChatId, '100'));

    expect(repliedMessages).toHaveLength(2);
    const invoice = repliedMessages[1];
    // Sourced from baseline: 620,000 IRR, total: 62,000,000 IRR
    expect(invoice).toContain('$100.00');
    expect(invoice).toContain('620,000');
    expect(invoice).toContain('62,000,000');

    // Verify DB row
    const [requestRow] = await db.select().from(topUpRequests);
    expect(requestRow).toBeDefined();
    expect(requestRow!.usdAmount).toBe('100.00');
    expect(requestRow!.irrAmount).toBe(62000000n);
    expect(requestRow!.lockedIrrPerUsd).toBe(620000n);
    expect(requestRow!.rateSource).toBe('BASELINE_FALLBACK');
    expect(requestRow!.exchangeRateId).toBe(baselineRate.id);
  });

  it('fails bot creation / startup when TOPUP_MIN_USD or TOPUP_MAX_USD is missing', () => {
    delete process.env.TOPUP_MIN_USD;
    expect(() => createBot({ token: 'test_token', dbClient: db })).toThrow(
      /TOPUP_MIN_USD and TOPUP_MAX_USD environment variables are required/i
    );
  });
});
