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
  getOrderRejectionCategoriesKeyboard,
  getOrderRejectionNotePromptKeyboard,
  getAdminOrderRejectedKeyboard,
  ORDER_REJECTION_CATEGORIES,
} from '@/bot/handlers/admin/order.keyboards';

describe('Admin Order Rejection Handler & Conversation (Ticket 07)', () => {
  const { db, container } = setupTestDatabase();
  const adminChatId1 = 111222333;
  const adminChatId2 = 444555666;
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
          text: '📦 سفارش',
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

  it('unit test: keyboard structure for categories, note prompts, and admin rejected display', () => {
    // 1. Categories keyboard
    const catKeyboard = getOrderRejectionCategoriesKeyboard();
    const flatCatButtons = catKeyboard.inline_keyboard.flat() as any[];

    expect(flatCatButtons.some((b) => b.callback_data === 'order_reject_cat:OUT_OF_STOCK')).toBe(true);
    expect(flatCatButtons.some((b) => b.callback_data === 'order_reject_cat:CANNOT_VERIFY')).toBe(true);
    expect(flatCatButtons.some((b) => b.callback_data === 'order_reject_cat:TECHNICAL_ISSUE')).toBe(true);
    expect(flatCatButtons.some((b) => b.callback_data === 'order_reject_cat:POLICY_VIOLATION')).toBe(true);
    expect(flatCatButtons.some((b) => b.callback_data === 'order_reject_cat:OTHER')).toBe(true);
    expect(flatCatButtons.some((b) => b.callback_data === 'flow:cancel')).toBe(true);

    // 2. Note prompt keyboard with skip
    const notePromptWithSkip = getOrderRejectionNotePromptKeyboard(true);
    const flatNoteWithSkip = notePromptWithSkip.inline_keyboard.flat() as any[];
    expect(flatNoteWithSkip.some((b) => b.callback_data === 'order_reject_note:skip')).toBe(true);
    expect(flatNoteWithSkip.some((b) => b.callback_data === 'flow:cancel')).toBe(true);

    // 3. Note prompt keyboard without skip (for OTHER)
    const notePromptWithoutSkip = getOrderRejectionNotePromptKeyboard(false);
    const flatNoteWithoutSkip = notePromptWithoutSkip.inline_keyboard.flat() as any[];
    expect(flatNoteWithoutSkip.some((b) => b.callback_data === 'order_reject_note:skip')).toBe(false);
    expect(flatNoteWithoutSkip.some((b) => b.callback_data === 'flow:cancel')).toBe(true);

    // 4. Admin rejected keyboard
    const rejectedKeyboard = getAdminOrderRejectedKeyboard('admin_john');
    const flatRejectedButtons = rejectedKeyboard.inline_keyboard.flat() as any[];
    expect(flatRejectedButtons).toHaveLength(1);
    expect(flatRejectedButtons[0]?.text).toContain('رد شده توسط @admin_john');
    expect(flatRejectedButtons[0]?.callback_data).toBe('order:noop');
  });

  it('rejects tapping [✗ Reject] on terminal orders with an alert', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: buyerChatId,
      telegramUsername: 'terminal_buyer',
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

    // Mark order FULFILLED
    await db
      .update(orders)
      .set({ status: 'FULFILLED', fulfilledAt: new Date() })
      .where(eq(orders.id, placedOrder.id));

    const { bot, answeredCallbackQueries, repliedMessages } = createTestBot();

    await bot.handleUpdate(
      makeCallbackQueryUpdate(
        1,
        adminChatId1,
        `order:reject:${placedOrder.id}`,
        801,
        'admin1'
      )
    );

    expect(answeredCallbackQueries).toHaveLength(1);
    expect(answeredCallbackQueries[0]?.show_alert).toBe(true);
    expect(answeredCallbackQueries[0]?.text).toMatch(/تعیین تکلیف شده|قابل رد کردن نیست/i);
    expect(repliedMessages).toHaveLength(0);
  });

  it('happy path from PLACED: admin selects preset category + skips note -> order REJECTED, refund written, buyer notified, admin notifications edited', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: buyerChatId,
      telegramUsername: 'happy_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '50.00' })
      .where(eq(wallets.id, wallet.id));

    const itemPrice = '15.00';
    const item = await createTestCatalogItem(container, {
      name: 'ExpressVPN 1 Month',
      usdPrice: itemPrice,
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

    const { bot, repliedMessages, editedMessages, sentMessages } = createTestBot();

    // Step 1: Admin taps [✗ Reject] on PLACED order notification
    await bot.handleUpdate(
      makeCallbackQueryUpdate(
        1,
        adminChatId1,
        `order:reject:${placedOrder.id}`,
        801,
        'lead_admin'
      )
    );

    expect(repliedMessages).toHaveLength(1);
    expect(repliedMessages[0]).toContain('رد سفارش');
    expect(repliedMessages[0]).toContain('علت رد سفارش را از گزینه‌های زیر انتخاب کنید');

    // Step 2: Admin selects preset category OUT_OF_STOCK
    await bot.handleUpdate(
      makeCallbackQueryUpdate(
        2,
        adminChatId1,
        'order_reject_cat:OUT_OF_STOCK',
        801,
        'lead_admin'
      )
    );

    expect(repliedMessages).toHaveLength(2);
    expect(repliedMessages[1]).toContain('علت انتخاب شده');
    expect(repliedMessages[1]).toContain(ORDER_REJECTION_CATEGORIES.OUT_OF_STOCK.label);

    // Step 3: Admin taps [⏩ رد کردن (بدون یادداشت)]
    await bot.handleUpdate(
      makeCallbackQueryUpdate(
        3,
        adminChatId1,
        'order_reject_note:skip',
        801,
        'lead_admin'
      )
    );

    // 1. Verify DB order state
    const [dbOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, placedOrder.id));

    expect(dbOrder).toBeDefined();
    expect(dbOrder?.status).toBe('REJECTED');
    expect(dbOrder?.rejectionCategory).toBe('OUT_OF_STOCK');
    expect(dbOrder?.rejectionNote).toBeNull();
    expect(dbOrder?.rejectedAt).toBeInstanceOf(Date);

    // 2. Verify Buyer balance is restored to 50.00
    const [dbWallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.id, wallet.id));
    expect(dbWallet?.availableBalance).toBe('50.00');

    // 3. Verify Buyer received push notification
    expect(sentMessages.length).toBeGreaterThanOrEqual(1);
    const buyerMsg = sentMessages.find(
      (m) => Number(m.chat_id) === buyerChatId
    );
    expect(buyerMsg).toBeDefined();
    expect(buyerMsg?.text).toContain('سفارش شما رد شد');
    expect(buyerMsg?.text).toContain('عدم موجودی');
    expect(buyerMsg?.text).toContain('15.00');
    expect(buyerMsg?.text).toContain('50.00');

    // 4. Verify Admin notifications updated with REJECTED status
    expect(editedMessages.length).toBeGreaterThanOrEqual(2);
    const admin1Edited = editedMessages.find(
      (m) => Number(m.chat_id) === adminChatId1
    );
    const admin2Edited = editedMessages.find(
      (m) => Number(m.chat_id) === adminChatId2
    );

    expect(admin1Edited).toBeDefined();
    const admin1Buttons = admin1Edited?.reply_markup?.inline_keyboard?.flat() ?? [];
    expect(admin1Buttons.some((b: any) => b.text.includes('رد شده توسط @lead_admin'))).toBe(true);

    expect(admin2Edited).toBeDefined();
    const admin2Buttons = admin2Edited?.reply_markup?.inline_keyboard?.flat() ?? [];
    expect(admin2Buttons.some((b: any) => b.text.includes('رد شده توسط @lead_admin'))).toBe(true);

    // 5. Admin received success reply
    const adminConfirmation = repliedMessages.find((m) =>
      m.includes('با موفقیت رد شد')
    );
    expect(adminConfirmation).toBeDefined();
  });


  it('happy path from PROCESSING: any admin rejects with OTHER category + text note', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: buyerChatId,
      telegramUsername: 'other_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '100.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'Service X',
      usdPrice: '20.00',
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

    // Admin 1 claims
    await claimTestOrder(container, {
      orderId: placedOrder.id,
      adminTelegramId: BigInt(adminChatId1),
      adminUsername: 'admin1',
    });

    const { bot, repliedMessages, sentMessages } = createTestBot();

    // Admin 2 initiates rejection on PROCESSING order
    await bot.handleUpdate(
      makeCallbackQueryUpdate(
        1,
        adminChatId2,
        `order:reject:${placedOrder.id}`,
        802,
        'second_admin'
      )
    );

    expect(repliedMessages[0]).toContain('رد سفارش');

    // Admin 2 selects OTHER category
    await bot.handleUpdate(
      makeCallbackQueryUpdate(
        2,
        adminChatId2,
        'order_reject_cat:OTHER',
        802,
        'second_admin'
      )
    );

    expect(repliedMessages[1]).toContain('سایر');
    expect(repliedMessages[1]).toContain('اجباری');

    // Admin 2 types text note
    const customReason = 'Account region is incompatible with customer account.';
    await bot.handleUpdate(
      makeMessageUpdate(3, adminChatId2, customReason, 'second_admin')
    );

    // Assert DB state
    const [dbOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, placedOrder.id));

    expect(dbOrder?.status).toBe('REJECTED');
    expect(dbOrder?.rejectionCategory).toBe('OTHER');
    expect(dbOrder?.rejectionNote).toBe(customReason);

    // Buyer received message with custom note
    const buyerMsg = sentMessages.find((m) => Number(m.chat_id) === buyerChatId);
    expect(buyerMsg?.text).toContain(customReason);

    // Admin received confirmation
    const adminConfirmation = repliedMessages.find((m) =>
      m.includes('با موفقیت رد شد')
    );
    expect(adminConfirmation).toBeDefined();
  });


  it('cancelling conversation (/cancel) aborts cleanly without altering order status or balance', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: buyerChatId,
      telegramUsername: 'cancel_flow_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '50.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'Service Z',
      usdPrice: '10.00',
      isActive: true,
    });

    const { order: placedOrder } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });

    const { bot, repliedMessages } = createTestBot();

    // Start rejection
    await bot.handleUpdate(
      makeCallbackQueryUpdate(
        1,
        adminChatId1,
        `order:reject:${placedOrder.id}`,
        801,
        'admin1'
      )
    );

    // Cancel on category step
    await bot.handleUpdate(
      makeCallbackQueryUpdate(
        2,
        adminChatId1,
        'flow:cancel',
        801,
        'admin1'
      )
    );

    expect(repliedMessages[1]).toContain('لغو شد');

    const [dbOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, placedOrder.id));

    expect(dbOrder?.status).toBe('PLACED');

    const [dbWallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.id, wallet.id));
    expect(dbWallet?.availableBalance).toBe('40.00'); // Remains debited
  });
});
