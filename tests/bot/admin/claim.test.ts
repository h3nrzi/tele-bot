import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { createMockFetch } from '@tests/helpers/mock-context';
import { createBot } from '@/bot/bot';
import {
  createTestBuyer,
  createTestCatalogItem,
  placeTestOrder,
} from '@tests/helpers/fixtures';
import { orders, orderAdminNotifications } from '@/modules/order/order.schema';
import { wallets } from '@/modules/wallet/wallet.schema';
import { eq } from 'drizzle-orm';
import {
  getAdminOrderNotificationKeyboard,
  getAdminOrderProcessingKeyboard,
} from '@/bot/handlers/admin/order.keyboards';

describe('Admin Order Claim & Start Processing Callback Handler (Ticket 05)', () => {
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
          text: '📦 سفارش جدید ثبت شد',
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

  it('unit test: getAdminOrderProcessingKeyboard structure', () => {
    const keyboard = getAdminOrderProcessingKeyboard('test-order-id', 'admin_jane');
    const flatButtons = keyboard.inline_keyboard.flat() as any[];

    expect(flatButtons).toHaveLength(3);

    const lockButton = flatButtons.find((btn) => btn.callback_data === 'order:noop');
    const fulfilButton = flatButtons.find((btn) => btn.callback_data === 'order:fulfil:test-order-id');
    const rejectButton = flatButtons.find((btn) => btn.callback_data === 'order:reject:test-order-id');

    expect(lockButton).toBeDefined();
    expect(lockButton?.text).toBe('🔒 Processing by @admin_jane');

    expect(fulfilButton).toBeDefined();
    expect(fulfilButton?.text).toBe('📦 Fulfil Order');

    expect(rejectButton).toBeDefined();
    expect(rejectButton?.text).toBe('✗ Reject');
  });

  it('happy path: admin taps [▶ Start Processing] -> transitions order to PROCESSING and edits all admin notifications', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: buyerChatId,
      telegramUsername: 'happy_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '50.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'Telegram Premium 1 Year',
      usdPrice: '29.99',
      isActive: true,
    });

    // Place order with notification records for both admin 1 and admin 2
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

    const { bot, editedMessages, answeredCallbackQueries } = createTestBot();

    // Admin 1 taps Start Processing
    await bot.handleUpdate(
      makeCallbackQueryUpdate(
        1,
        adminChatId1,
        `order:process:${placedOrder.id}`,
        801,
        'lead_admin'
      )
    );

    // 1. Verify DB state: PROCESSING, claimed_by_admin_telegram_id = adminChatId1
    const [dbOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, placedOrder.id));

    expect(dbOrder).toBeDefined();
    expect(dbOrder?.status).toBe('PROCESSING');
    expect(dbOrder?.claimedByAdminTelegramId).toBe(BigInt(adminChatId1));
    expect(dbOrder?.claimedAt).toBeInstanceOf(Date);

    // 2. Verify callback query answered with confirmation
    expect(answeredCallbackQueries).toHaveLength(1);
    expect(answeredCallbackQueries[0]?.callback_query_id).toBe('cb_query_1');
    expect(answeredCallbackQueries[0]?.text).toContain('اختصاص یافت');

    // 3. Verify all admin notifications were edited via editMessageReplyMarkup
    expect(editedMessages).toHaveLength(2);

    const admin1Edited = editedMessages.find((m) => Number(m.chat_id) === adminChatId1);
    const admin2Edited = editedMessages.find((m) => Number(m.chat_id) === adminChatId2);

    expect(admin1Edited).toBeDefined();
    expect(admin1Edited?.message_id).toBe(801);
    const admin1Buttons = admin1Edited?.reply_markup?.inline_keyboard?.flat() ?? [];
    expect(admin1Buttons.some((b: any) => b.text.includes('@lead_admin'))).toBe(true);
    expect(admin1Buttons.some((b: any) => b.callback_data === `order:fulfil:${placedOrder.id}`)).toBe(true);
    expect(admin1Buttons.some((b: any) => b.callback_data === `order:reject:${placedOrder.id}`)).toBe(true);

    expect(admin2Edited).toBeDefined();
    expect(admin2Edited?.message_id).toBe(802);
    const admin2Buttons = admin2Edited?.reply_markup?.inline_keyboard?.flat() ?? [];
    expect(admin2Buttons.some((b: any) => b.text.includes('@lead_admin'))).toBe(true);
    expect(admin2Buttons.some((b: any) => b.callback_data === `order:fulfil:${placedOrder.id}`)).toBe(true);
    expect(admin2Buttons.some((b: any) => b.callback_data === `order:reject:${placedOrder.id}`)).toBe(true);
  });

  it('multi-admin race: second admin tap shows "already claimed" alert', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: buyerChatId,
      telegramUsername: 'race_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '50.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'VPN 1 Month',
      usdPrice: '5.00',
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

    const { bot, answeredCallbackQueries } = createTestBot();

    // 1. Admin 1 claims
    await bot.handleUpdate(
      makeCallbackQueryUpdate(
        1,
        adminChatId1,
        `order:process:${placedOrder.id}`,
        801,
        'fast_admin'
      )
    );

    // 2. Admin 2 taps on their copy of the notification
    await bot.handleUpdate(
      makeCallbackQueryUpdate(
        2,
        adminChatId2,
        `order:process:${placedOrder.id}`,
        802,
        'slow_admin'
      )
    );

    // Assert second callback query received alert
    expect(answeredCallbackQueries).toHaveLength(2);
    expect(answeredCallbackQueries[1]?.show_alert).toBe(true);
    expect(answeredCallbackQueries[1]?.text).toMatch(/قبلاً توسط ادمین دیگری|already/i);

    // DB state remains claimed by Admin 1
    const [dbOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, placedOrder.id));

    expect(dbOrder?.claimedByAdminTelegramId).toBe(BigInt(adminChatId1));
  });

  it('silently ignores callback queries from non-Admins', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: buyerChatId,
      telegramUsername: 'non_admin_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '50.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'Game Pass',
      usdPrice: '15.00',
      isActive: true,
    });

    const { order: placedOrder } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });

    const { bot, editedMessages, answeredCallbackQueries } = createTestBot();

    // Non-admin taps
    await bot.handleUpdate(
      makeCallbackQueryUpdate(
        1,
        nonAdminChatId,
        `order:process:${placedOrder.id}`,
        999,
        'imposter'
      )
    );

    // DB remains PLACED
    const [dbOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, placedOrder.id));

    expect(dbOrder?.status).toBe('PLACED');
    expect(dbOrder?.claimedByAdminTelegramId).toBeNull();

    expect(editedMessages).toHaveLength(0);
    expect(answeredCallbackQueries).toHaveLength(0);
  });

  it('shows alert when attempting to claim terminal order', async () => {
    const { buyer, wallet } = await createTestBuyer(container, {
      telegramChatId: buyerChatId,
      telegramUsername: 'terminal_buyer',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '50.00' })
      .where(eq(wallets.id, wallet.id));

    const item = await createTestCatalogItem(container, {
      name: 'Discord Nitro',
      usdPrice: '10.00',
      isActive: true,
    });

    const { order: placedOrder } = await placeTestOrder(container, {
      userId: buyer.id,
      catalogItemId: item.id,
    });

    // Mark as FULFILLED
    await db
      .update(orders)
      .set({ status: 'FULFILLED', fulfilledAt: new Date() })
      .where(eq(orders.id, placedOrder.id));

    const { bot, answeredCallbackQueries } = createTestBot();

    await bot.handleUpdate(
      makeCallbackQueryUpdate(
        1,
        adminChatId1,
        `order:process:${placedOrder.id}`,
        801,
        'admin_user'
      )
    );

    expect(answeredCallbackQueries).toHaveLength(1);
    expect(answeredCallbackQueries[0]?.show_alert).toBe(true);
    expect(answeredCallbackQueries[0]?.text).toMatch(/تعیین تکلیف شده|قابل دریافت نیست/i);
  });

  it('answers non-interactive order:noop button cleanly', async () => {
    const { bot, answeredCallbackQueries } = createTestBot();

    await bot.handleUpdate(
      makeCallbackQueryUpdate(1, adminChatId1, 'order:noop', 801, 'admin_user')
    );

    expect(answeredCallbackQueries).toHaveLength(1);
    expect(answeredCallbackQueries[0]?.callback_query_id).toBe('cb_query_1');
  });

  it('answers order:fulfil stub callback cleanly', async () => {
    const { bot, answeredCallbackQueries } = createTestBot();

    await bot.handleUpdate(
      makeCallbackQueryUpdate(
        1,
        adminChatId1,
        'order:fulfil:test-order-id',
        801,
        'admin_user'
      )
    );

    expect(answeredCallbackQueries).toHaveLength(1);
    expect(answeredCallbackQueries[0]?.show_alert).toBe(true);
    expect(answeredCallbackQueries[0]?.text).toContain('فاز بعدی');
  });
});
