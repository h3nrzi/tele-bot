import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { createMockFetch } from '@tests/helpers/mock-context';
import { createBot } from '@/bot/bot';
import {
  createTestBuyer,
  createTestCatalogItem,
  placeTestOrder,
  claimTestOrder,
} from '@tests/helpers/fixtures';
import { orders } from '@/modules/order/order.schema';
import { wallets } from '@/modules/wallet/wallet.schema';
import { eq } from 'drizzle-orm';
import {
  getFulfilOrderConfirmationKeyboard,
  getAdminOrderFulfilledKeyboard,
} from '@/bot/handlers/admin/order.keyboards';

describe('Admin Order Fulfilment Handler & Conversation (Ticket 06)', () => {
  const { db, container } = setupTestDatabase();
  const adminChatId1 = 111222333;
  const adminChatId2 = 444555666;
  const nonAdminChatId = 777888999;
  const buyerChatId = 987654321;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.ADMIN_IDS = `${adminChatId1},${adminChatId2}`;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function makeMessageUpdate(
    updateId: number,
    chatId: number,
    text: string,
    username = 'admin_user'
  ) {
    const isCommand = text.startsWith('/');
    const commandLength = text.indexOf(' ') > 0 ? text.indexOf(' ') : text.length;

    const message: Record<string, unknown> = {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: 'private', username },
      from: { id: chatId, is_bot: false, username, first_name: 'Admin' },
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

  function makeCallbackQueryUpdate(
    updateId: number,
    chatId: number,
    data: string,
    messageId = 10,
    username = 'admin_user'
  ) {
    return {
      update_id: updateId,
      callback_query: {
        id: `cb_query_${updateId}`,
        from: {
          id: chatId,
          is_bot: false,
          first_name: 'Admin',
          username,
        },
        message: {
          message_id: messageId,
          date: Math.floor(Date.now() / 1000),
          chat: { id: chatId, type: 'private' },
          text: '📦 سفارش در حال پردازش',
        },
        data,
      },
    } as any;
  }

  function createTestBot() {
    const repliedMessages: string[] = [];
    const editedMessages: any[] = [];
    const answeredCallbackQueries: any[] = [];
    const sentMessages: any[] = [];

    const { fetch: mockFetch } = createMockFetch(
      repliedMessages,
      [],
      editedMessages,
      answeredCallbackQueries,
      sentMessages
    );

    const bot = createBot({
      token: 'test_token',
      dbClient: db,
      adminIds: `${adminChatId1},${adminChatId2}`,
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

    return {
      bot,
      repliedMessages,
      editedMessages,
      answeredCallbackQueries,
      sentMessages,
    };
  }

  it('unit test: getFulfilOrderConfirmationKeyboard and getAdminOrderFulfilledKeyboard structure', () => {
    const confirmKeyboard = getFulfilOrderConfirmationKeyboard();
    const flatConfirmButtons = confirmKeyboard.inline_keyboard.flat() as any[];

    expect(flatConfirmButtons.some((b) => b.callback_data === 'fulfil:confirm')).toBe(true);
    expect(flatConfirmButtons.some((b) => b.callback_data === 'fulfil:reenter')).toBe(true);
    expect(flatConfirmButtons.some((b) => b.callback_data === 'flow:cancel')).toBe(true);

    const fulfilledKeyboard = getAdminOrderFulfilledKeyboard('superadmin');
    const flatFulfilledButtons = fulfilledKeyboard.inline_keyboard.flat() as any[];

    expect(flatFulfilledButtons).toHaveLength(1);
    expect(flatFulfilledButtons[0]?.text).toContain('تکمیل شده توسط @superadmin');
    expect(flatFulfilledButtons[0]?.callback_data).toBe('order:noop');
  });

  it('rejects non-claiming Admin tapping [📦 Fulfil Order] with alert and blocks conversation', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: buyerChatId,
      telegramUsername: 'happy_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '50.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'NordVPN 1 Year',
      usdPrice: '30.00',
      isActive: true,
    });

    const { order: placedOrder } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });

    // Admin 1 claims
    await claimTestOrder(container, {
      orderId: placedOrder.id,
      adminTelegramId: BigInt(adminChatId1),
      adminUsername: 'claimer_admin',
    });

    const { bot, repliedMessages, answeredCallbackQueries } = createTestBot();

    // Admin 2 tries to tap [📦 Fulfil Order]
    await bot.handleUpdate(
      makeCallbackQueryUpdate(
        1,
        adminChatId2,
        `order:fulfil:${placedOrder.id}`,
        802,
        'other_admin'
      )
    );

    expect(answeredCallbackQueries).toHaveLength(1);
    expect(answeredCallbackQueries[0]?.show_alert).toBe(true);
    expect(answeredCallbackQueries[0]?.text).toMatch(/مجاز به تحویل این سفارش نیستید|ادمین دیگری/i);
    expect(repliedMessages).toHaveLength(0); // Conversation did not start
  });

  it('rejects tapping [📦 Fulfil Order] on order not in PROCESSING state', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: buyerChatId,
      telegramUsername: 'happy_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '50.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'Item A',
      usdPrice: '10.00',
      isActive: true,
    });

    const { order: placedOrder } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });

    const { bot, answeredCallbackQueries, repliedMessages } = createTestBot();

    // Order is in PLACED (not yet claimed)
    await bot.handleUpdate(
      makeCallbackQueryUpdate(
        1,
        adminChatId1,
        `order:fulfil:${placedOrder.id}`,
        801,
        'admin1'
      )
    );

    expect(answeredCallbackQueries).toHaveLength(1);
    expect(answeredCallbackQueries[0]?.show_alert).toBe(true);
    expect(repliedMessages).toHaveLength(0);
  });

  it('happy path: 3-step conversation (input -> preview & confirm -> commit) fulfils order, notifies buyer, and updates admin notifications', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: buyerChatId,
      telegramUsername: 'happy_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '50.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'ExpressVPN 1 Month',
      usdPrice: '12.99',
      isActive: true,
    });

    const { order: placedOrder } = await placeTestOrder(
      container,
      {
        userId: buyer.id,
        catalogItemId: item.id,
      },
      {
        notifyAdmins: async () => [
          { adminTelegramId: BigInt(adminChatId1), chatId: BigInt(adminChatId1), messageId: 801n },
          { adminTelegramId: BigInt(adminChatId2), chatId: BigInt(adminChatId2), messageId: 802n },
        ],
      }
    );

    await claimTestOrder(container, {
      orderId: placedOrder.id,
      adminTelegramId: BigInt(adminChatId1),
      adminUsername: 'lead_admin',
    });

    const { bot, repliedMessages, editedMessages, sentMessages } = createTestBot();

    // Step 1: Claiming Admin taps [📦 Fulfil Order]
    await bot.handleUpdate(
      makeCallbackQueryUpdate(
        1,
        adminChatId1,
        `order:fulfil:${placedOrder.id}`,
        801,
        'lead_admin'
      )
    );

    expect(repliedMessages).toHaveLength(1);
    expect(repliedMessages[0]).toContain('تحویل سفارش');

    // Step 2: Admin inputs delivery content
    const deliveryContent = 'Username: vpn_user_99\nPassword: securePassword123';
    await bot.handleUpdate(
      makeMessageUpdate(2, adminChatId1, deliveryContent, 'lead_admin')
    );

    expect(repliedMessages).toHaveLength(2);
    expect(repliedMessages[1]).toContain('پیش‌نمایش');
    expect(repliedMessages[1]).toContain(deliveryContent);

    // Step 3: Admin confirms via [✓ Send] callback query
    await bot.handleUpdate(
      makeCallbackQueryUpdate(
        3,
        adminChatId1,
        'fulfil:confirm',
        801,
        'lead_admin'
      )
    );

    // 1. Verify DB state: FULFILLED, deliveryContent stored, fulfilledAt set
    const [dbOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, placedOrder.id));

    expect(dbOrder).toBeDefined();
    expect(dbOrder?.status).toBe('FULFILLED');
    expect(dbOrder?.deliveryContent).toBe(deliveryContent);
    expect(dbOrder?.fulfilledAt).toBeInstanceOf(Date);

    // 2. Verify Buyer received Telegram message with delivery content
    expect(sentMessages.length).toBeGreaterThanOrEqual(1);
    const buyerMessage = sentMessages.find(
      (m) => Number(m.chat_id) === buyerChatId
    );
    expect(buyerMessage).toBeDefined();
    expect(buyerMessage?.text).toContain(deliveryContent);
    expect(buyerMessage?.text).toContain('تحویل داده شد');

    // 3. Verify all Admin notifications were updated to show FULFILLED state
    expect(editedMessages.length).toBeGreaterThanOrEqual(2);
    const admin1Edited = editedMessages.find(
      (m) => Number(m.chat_id) === adminChatId1
    );
    const admin2Edited = editedMessages.find(
      (m) => Number(m.chat_id) === adminChatId2
    );

    expect(admin1Edited).toBeDefined();
    const admin1Buttons = admin1Edited?.reply_markup?.inline_keyboard?.flat() ?? [];
    expect(admin1Buttons.some((b: any) => b.text.includes('تکمیل شده توسط @lead_admin'))).toBe(true);

    expect(admin2Edited).toBeDefined();
    const admin2Buttons = admin2Edited?.reply_markup?.inline_keyboard?.flat() ?? [];
    expect(admin2Buttons.some((b: any) => b.text.includes('تکمیل شده توسط @lead_admin'))).toBe(true);

    // 4. Verify Admin received confirmation
    expect(repliedMessages[2]).toContain('با موفقیت تحویل داده شد');
  });

  it('re-enter loop: tapping [✗ Re-enter] loops back to Step 1 without submitting until confirmed', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: buyerChatId,
      telegramUsername: 'loop_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '50.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'Service Item',
      usdPrice: '10.00',
      isActive: true,
    });

    const { order: placedOrder } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });

    await claimTestOrder(container, {
      orderId: placedOrder.id,
      adminTelegramId: BigInt(adminChatId1),
      adminUsername: 'lead_admin',
    });

    const { bot, repliedMessages, sentMessages } = createTestBot();

    // Start fulfilment
    await bot.handleUpdate(
      makeCallbackQueryUpdate(
        1,
        adminChatId1,
        `order:fulfil:${placedOrder.id}`,
        801,
        'lead_admin'
      )
    );

    // Input draft 1
    await bot.handleUpdate(
      makeMessageUpdate(2, adminChatId1, 'Draft content 1', 'lead_admin')
    );

    expect(repliedMessages[1]).toContain('Draft content 1');

    // Tap [✗ Re-enter]
    await bot.handleUpdate(
      makeCallbackQueryUpdate(
        3,
        adminChatId1,
        'fulfil:reenter',
        801,
        'lead_admin'
      )
    );

    expect(repliedMessages[2]).toContain('تحویل سفارش');

    // Input final content
    const finalContent = 'Final Correct Credentials Key: 1234-5678';
    await bot.handleUpdate(
      makeMessageUpdate(4, adminChatId1, finalContent, 'lead_admin')
    );

    expect(repliedMessages[3]).toContain(finalContent);

    // Confirm
    await bot.handleUpdate(
      makeCallbackQueryUpdate(
        5,
        adminChatId1,
        'fulfil:confirm',
        801,
        'lead_admin'
      )
    );

    // Assert final DB content
    const [dbOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, placedOrder.id));

    expect(dbOrder?.status).toBe('FULFILLED');
    expect(dbOrder?.deliveryContent).toBe(finalContent);

    // Buyer received only the final content
    const buyerMsg = sentMessages.find((m) => Number(m.chat_id) === buyerChatId);
    expect(buyerMsg?.text).toContain(finalContent);
  });

  it('cancelling conversation (/cancel) aborts cleanly without updating DB status', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: buyerChatId,
      telegramUsername: 'cancel_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '50.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'Test Service',
      usdPrice: '10.00',
      isActive: true,
    });

    const { order: placedOrder } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });

    await claimTestOrder(container, {
      orderId: placedOrder.id,
      adminTelegramId: BigInt(adminChatId1),
      adminUsername: 'lead_admin',
    });

    const { bot, repliedMessages } = createTestBot();

    // Start fulfilment
    await bot.handleUpdate(
      makeCallbackQueryUpdate(
        1,
        adminChatId1,
        `order:fulfil:${placedOrder.id}`,
        801,
        'lead_admin'
      )
    );

    // Send /cancel
    await bot.handleUpdate(
      makeMessageUpdate(2, adminChatId1, '/cancel', 'lead_admin')
    );

    expect(repliedMessages[1]).toContain('لغو شد');

    const [dbOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, placedOrder.id));

    expect(dbOrder?.status).toBe('PROCESSING');
    expect(dbOrder?.deliveryContent).toBeNull();
    expect(dbOrder?.fulfilledAt).toBeNull();
  });
});
