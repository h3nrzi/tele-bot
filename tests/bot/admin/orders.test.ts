import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import {
  createMockFetch,
  type MockEditedMessage,
  type MockAnsweredCallbackQuery,
} from '@tests/helpers/mock-context';
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
  getAdminOrderQueueItemKeyboard,
} from '@/bot/handlers/admin/order.keyboards';

describe('/orders Admin Queue Command (Ticket 09)', () => {
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

  function makeCommandUpdate(
    updateId: number,
    chatId: number,
    text: string,
    username = 'admin_user'
  ) {
    const commandLength = text.indexOf(' ') > 0 ? text.indexOf(' ') : text.length;
    return {
      update_id: updateId,
      message: {
        message_id: updateId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: 'private', first_name: 'User', username },
        from: { id: chatId, is_bot: false, first_name: 'User', username },
        text,
        entities: [{ offset: 0, length: commandLength, type: 'bot_command' }],
      },
    } as any;
  }

  function makeTextUpdate(
    updateId: number,
    chatId: number,
    text: string,
    username = 'admin_user'
  ) {
    return {
      update_id: updateId,
      message: {
        message_id: updateId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: 'private', first_name: 'User', username },
        from: { id: chatId, is_bot: false, first_name: 'User', username },
        text,
      },
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
        id: `cq_${updateId}`,
        from: { id: chatId, is_bot: false, first_name: 'Admin', username },
        data,
        message: {
          message_id: messageId,
          date: Math.floor(Date.now() / 1000),
          chat: { id: chatId, type: 'private' },
          text: '📦 سفارش',
        },
      },
    } as any;
  }

  function createTestBot() {
    const repliedMessages: string[] = [];
    const editedMessages: MockEditedMessage[] = [];
    const answeredCallbackQueries: MockAnsweredCallbackQuery[] = [];
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

  it('unit test: getAdminOrderQueueItemKeyboard creates correct buttons for all statuses', () => {
    // 1. PLACED
    const placedKb = getAdminOrderQueueItemKeyboard({
      orderId: 'order-1',
      status: 'PLACED',
      currentAdminTelegramId: adminChatId1,
    });
    const placedButtons = placedKb.inline_keyboard.flat() as any[];
    expect(placedButtons).toHaveLength(2);
    expect(placedButtons[0].text).toBe('▶ شروع پردازش');
    expect(placedButtons[0].callback_data).toBe('order:process:order-1');
    expect(placedButtons[1].text).toBe('✗ رد سفارش');
    expect(placedButtons[1].callback_data).toBe('order:reject:order-1');

    // 2. PROCESSING claimed by current Admin
    const claimedByMeKb = getAdminOrderQueueItemKeyboard({
      orderId: 'order-2',
      status: 'PROCESSING',
      claimedByAdminTelegramId: BigInt(adminChatId1),
      currentAdminTelegramId: adminChatId1,
    });
    const myButtons = claimedByMeKb.inline_keyboard.flat() as any[];
    expect(myButtons).toHaveLength(2);
    expect(myButtons[0].text).toBe('📦 تحویل سفارش');
    expect(myButtons[0].callback_data).toBe('order:fulfil:order-2');
    expect(myButtons[1].text).toBe('✗ رد سفارش');
    expect(myButtons[1].callback_data).toBe('order:reject:order-2');

    // 3. PROCESSING claimed by another Admin
    const claimedByOtherKb = getAdminOrderQueueItemKeyboard({
      orderId: 'order-3',
      status: 'PROCESSING',
      claimedByAdminTelegramId: BigInt(adminChatId2),
      currentAdminTelegramId: adminChatId1,
      claimedByAdminDisplay: 'other_admin',
    });
    const otherButtons = claimedByOtherKb.inline_keyboard.flat() as any[];
    expect(otherButtons).toHaveLength(2);
    expect(otherButtons[0].text).toContain('در حال پردازش توسط @other_admin');
    expect(otherButtons[0].callback_data).toBe('order:noop');
    expect(otherButtons[1].text).toBe('✗ رد سفارش');
    expect(otherButtons[1].callback_data).toBe('order:reject:order-3');
  });

  it('restricts /orders to Admin users; non-Admins receive access-denied message', async () => {
    const { bot, repliedMessages } = createTestBot();

    await bot.handleUpdate(makeCommandUpdate(1, nonAdminChatId, '/orders', 'stranger'));

    expect(repliedMessages).toHaveLength(1);
    expect(repliedMessages[0]).toContain('دسترسی غیرمجاز');
  });

  it('shows graceful "no active orders" message when queue is empty', async () => {
    const { bot, repliedMessages } = createTestBot();

    await bot.handleUpdate(makeCommandUpdate(1, adminChatId1, '/orders', 'admin_one'));

    expect(repliedMessages).toHaveLength(1);
    expect(repliedMessages[0]).toContain('هیچ سفارش فعالی در صف وجود ندارد');
  });

  it('renders active orders with correct details and buttons, and excludes terminal orders', async () => {
    const { buyer: buyer1, wallet: wallet1 } = await createTestBuyer(container, {
      telegramChatId: buyerChatId,
      telegramUsername: 'happy_buyer',
    });

    const { buyer: buyer2, wallet: wallet2 } = await createTestBuyer(container, {
      telegramChatId: 888777666,
      telegramUsername: null,
    });

    await db
      .update(wallets)
      .set({ availableBalance: '500.00' })
      .where(eq(wallets.id, wallet1.id));

    await db
      .update(wallets)
      .set({ availableBalance: '500.00' })
      .where(eq(wallets.id, wallet2.id));

    const item1 = await createTestCatalogItem(container, {
      name: 'Spotify Premium 1 Month',
      usdPrice: '9.99',
      isActive: true,
    });

    const item2 = await createTestCatalogItem(container, {
      name: 'Telegram Premium 1 Year',
      usdPrice: '29.99',
      isActive: true,
    });

    const item3 = await createTestCatalogItem(container, {
      name: 'Netflix 4K 1 Month',
      usdPrice: '15.00',
      isActive: true,
    });

    // 1. Order 1: PLACED
    const { order: placedOrder } = await placeTestOrder(container, {
      userId: buyer1.id,
      catalogItemId: item1.id,
    });

    // 2. Order 2: PROCESSING (claimed by admin 1)
    const { order: processingByMeOrder } = await placeTestOrder(container, {
      userId: buyer1.id,
      catalogItemId: item2.id,
    });
    await claimTestOrder(container, {
      orderId: processingByMeOrder.id,
      adminTelegramId: BigInt(adminChatId1),
      adminUsername: 'admin_one',
    });

    // 3. Order 3: PROCESSING (claimed by admin 2)
    const { order: processingByOtherOrder } = await placeTestOrder(container, {
      userId: buyer2.id,
      catalogItemId: item3.id,
    });
    await claimTestOrder(container, {
      orderId: processingByOtherOrder.id,
      adminTelegramId: BigInt(adminChatId2),
      adminUsername: 'admin_two',
    });

    // 4. Order 4: FULFILLED (terminal)
    const { order: fulfilledOrder } = await placeTestOrder(container, {
      userId: buyer1.id,
      catalogItemId: item1.id,
    });
    await db
      .update(orders)
      .set({ status: 'FULFILLED', deliveryContent: 'done', fulfilledAt: new Date() })
      .where(eq(orders.id, fulfilledOrder.id));

    // 5. Order 5: REJECTED (terminal)
    const { order: rejectedOrder } = await placeTestOrder(container, {
      userId: buyer1.id,
      catalogItemId: item1.id,
    });
    await db
      .update(orders)
      .set({ status: 'REJECTED', rejectionCategory: 'OUT_OF_STOCK', rejectedAt: new Date() })
      .where(eq(orders.id, rejectedOrder.id));

    // 6. Order 6: CANCELLED (terminal)
    const { order: cancelledOrder } = await placeTestOrder(container, {
      userId: buyer1.id,
      catalogItemId: item1.id,
    });
    await db
      .update(orders)
      .set({ status: 'CANCELLED', cancelledAt: new Date() })
      .where(eq(orders.id, cancelledOrder.id));

    const { bot, repliedMessages } = createTestBot();

    // Admin 1 sends /orders
    await bot.handleUpdate(makeCommandUpdate(1, adminChatId1, '/orders', 'admin_one'));

    // Should receive exactly 3 message blocks (for the 3 active orders)
    expect(repliedMessages).toHaveLength(3);

    // Message 1: PLACED order
    const msg1 = repliedMessages[0]!;
    expect(msg1).toContain('Spotify Premium 1 Month');
    expect(msg1).toContain('$9.99');
    expect(msg1).toContain('@happy_buyer');
    expect(msg1).toContain('در انتظار شروع پردازش');

    // Message 2: PROCESSING (claimed by Admin 1)
    const msg2 = repliedMessages[1]!;
    expect(msg2).toContain('Telegram Premium 1 Year');
    expect(msg2).toContain('$29.99');
    expect(msg2).toContain('در حال پردازش');
    expect(msg2).toContain('مسئول پردازش');
    expect(msg2).toContain('شما');

    // Message 3: PROCESSING (claimed by Admin 2)
    const msg3 = repliedMessages[2]!;
    expect(msg3).toContain('Netflix 4K 1 Month');
    expect(msg3).toContain('$15.00');
    expect(msg3).toContain('888777666');
    expect(msg3).toContain('در حال پردازش');
    expect(msg3).toContain('مسئول پردازش:');

    // None of the terminal orders should appear
    expect(repliedMessages.some((m) => m.includes(fulfilledOrder.id.slice(0, 8)))).toBe(false);
    expect(repliedMessages.some((m) => m.includes(rejectedOrder.id.slice(0, 8)))).toBe(false);
    expect(repliedMessages.some((m) => m.includes(cancelledOrder.id.slice(0, 8)))).toBe(false);
  });

  it('triggers /orders via admin menu button "📋 سفارش‌های فعال"', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: buyerChatId,
      telegramUsername: 'menu_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '50.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'Discord Nitro 1 Month',
      usdPrice: '9.99',
      isActive: true,
    });

    await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });

    const { bot, repliedMessages } = createTestBot();

    await bot.handleUpdate(makeTextUpdate(1, adminChatId1, '📋 سفارش‌های فعال', 'admin_one'));

    expect(repliedMessages).toHaveLength(1);
    expect(repliedMessages[0]).toContain('Discord Nitro 1 Month');
  });

  it('action button [▶ Start Processing] from /orders works identically to notification button', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: buyerChatId,
      telegramUsername: 'queue_claim_buyer',
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

    const { order: placedOrder } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });

    const { bot, answeredCallbackQueries } = createTestBot();

    // Admin 1 taps [▶ Start Processing] (`order:process:<orderId>`)
    await bot.handleUpdate(
      makeCallbackQueryUpdate(
        1,
        adminChatId1,
        `order:process:${placedOrder.id}`,
        100,
        'admin_one'
      )
    );

    // Verify order transitioned to PROCESSING
    const [dbOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, placedOrder.id));

    expect(dbOrder?.status).toBe('PROCESSING');
    expect(dbOrder?.claimedByAdminTelegramId).toBe(BigInt(adminChatId1));
    expect(answeredCallbackQueries).toHaveLength(1);
    expect(answeredCallbackQueries[0]?.text).toContain('شروع پردازش');
  });

  it('action button [📦 Fulfil Order] from /orders opens fulfilment conversation for claiming Admin', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: buyerChatId,
      telegramUsername: 'queue_fulfil_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '50.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'Item Fulfil',
      usdPrice: '5.00',
      isActive: true,
    });

    const { order: placedOrder } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });

    await claimTestOrder(container, {
      orderId: placedOrder.id,
      adminTelegramId: BigInt(adminChatId1),
      adminUsername: 'admin_one',
    });

    const { bot, repliedMessages } = createTestBot();

    // Admin 1 taps [📦 Fulfil Order]
    await bot.handleUpdate(
      makeCallbackQueryUpdate(
        1,
        adminChatId1,
        `order:fulfil:${placedOrder.id}`,
        101,
        'admin_one'
      )
    );

    expect(repliedMessages).toHaveLength(1);
    expect(repliedMessages[0]).toContain('تحویل سفارش');
  });

  it('action button [✗ Reject] from /orders opens rejection conversation', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: buyerChatId,
      telegramUsername: 'queue_reject_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '50.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'Item Reject',
      usdPrice: '5.00',
      isActive: true,
    });

    const { order: placedOrder } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });

    const { bot, repliedMessages } = createTestBot();

    // Admin 1 taps [✗ Reject]
    await bot.handleUpdate(
      makeCallbackQueryUpdate(
        1,
        adminChatId1,
        `order:reject:${placedOrder.id}`,
        102,
        'admin_one'
      )
    );

    expect(repliedMessages).toHaveLength(1);
    expect(repliedMessages[0]).toContain('علت رد سفارش را از گزینه‌های زیر انتخاب کنید');
  });
});
