import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import {
  createMockFetch,
  type MockSentPhoto,
  type MockEditedMessage,
  type MockAnsweredCallbackQuery,
} from '@tests/helpers/mock-context';
import { createBot } from '@/bot/bot';
import { setTestRate, setTestActiveAccount } from '@tests/helpers/fixtures';
import { topUpRequests } from '@/modules/top-up/top-up.schema';
import { wallets } from '@/modules/wallet/wallet.schema';
import { ledgerTransactions, ledgerEntries } from '@/modules/ledger/ledger.schema';
import { eq } from 'drizzle-orm';

describe('Admin Rejection Conversation & Callback Handler', () => {
  const { db, container } = setupTestDatabase();
  const adminChatId1 = 111222333;
  const adminChatId2 = 444555666;
  const nonAdminChatId = 777888999;
  const buyerChatId = 987654321;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.ADMIN_IDS = `${adminChatId1},${adminChatId2}`;
    process.env.TOPUP_MIN_USD = '10.00';
    process.env.TOPUP_MAX_USD = '1000.00';
    process.env.TOPUP_INITIATED_EXPIRY_MINUTES = '30';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function makeCommandUpdate(updateId: number, chatId: number, text: string) {
    const commandLength = text.indexOf(' ') > 0 ? text.indexOf(' ') : text.length;
    return {
      update_id: updateId,
      message: {
        message_id: updateId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: 'private', first_name: 'Buyer' },
        from: { id: chatId, is_bot: false, first_name: 'Buyer', username: 'buyer_user' },
        text,
        entities: [{ offset: 0, length: commandLength, type: 'bot_command' }],
      },
    } as any;
  }

  function makeTextUpdate(updateId: number, chatId: number, text: string, username = 'admin_user') {
    return {
      update_id: updateId,
      message: {
        message_id: updateId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: 'private', first_name: 'Admin' },
        from: { id: chatId, is_bot: false, first_name: 'Admin', username },
        text,
      },
    } as any;
  }

  function makePhotoUpdate(updateId: number, chatId: number, fileId: string, caption?: string) {
    return {
      update_id: updateId,
      message: {
        message_id: updateId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: 'private', first_name: 'Buyer' },
        from: { id: chatId, is_bot: false, first_name: 'Buyer', username: 'buyer_user' },
        photo: [
          { file_id: `${fileId}_thumb`, width: 90, height: 90 },
          { file_id: fileId, width: 800, height: 800 },
        ],
        caption,
      },
    } as any;
  }

  function makeCallbackQueryUpdate(
    updateId: number,
    adminChatId: number,
    data: string,
    messageId = 10,
    caption = '📥 رسید پرداخت جدید دریافت شد\n\nمبلغ: $100.00',
    adminUsername = 'admin_user'
  ) {
    return {
      update_id: updateId,
      callback_query: {
        id: `cb_query_${updateId}`,
        from: {
          id: adminChatId,
          is_bot: false,
          first_name: 'Admin',
          username: adminUsername,
        },
        message: {
          message_id: messageId,
          date: Math.floor(Date.now() / 1000),
          chat: { id: adminChatId, type: 'private' },
          caption,
          photo: [{ file_id: 'receipt_photo_123', width: 100, height: 100 }],
        },
        data,
        chat_instance: 'instance_123',
      },
    } as any;
  }

  function createTestBot(customFetch?: typeof fetch) {
    const repliedMessages: string[] = [];
    const sentPhotos: MockSentPhoto[] = [];
    const editedMessages: MockEditedMessage[] = [];
    const answeredCallbackQueries: MockAnsweredCallbackQuery[] = [];
    const { fetch: mockFetch } = createMockFetch(
      repliedMessages,
      sentPhotos,
      editedMessages,
      answeredCallbackQueries
    );

    const bot = createBot({
      token: 'test_token',
      dbClient: db,
      adminIds: `${adminChatId1},${adminChatId2}`,
      client: {
        fetch: customFetch ?? mockFetch,
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
      sentPhotos,
      editedMessages,
      answeredCallbackQueries,
      mockFetch,
    };
  }

  async function setupPendingTopUpFlow(bot: ReturnType<typeof createTestBot>['bot']) {
    await setTestRate(container, BigInt(adminChatId1), 620000n);
    await setTestActiveAccount(
      container,
      {
        cardNumber: '6037991234567890',
        cardHolderName: 'Ali Reza',
        bankName: 'Mellat Bank',
      }
    );

    await bot.handleUpdate(makeCommandUpdate(1, buyerChatId, '/topup'));
    await bot.handleUpdate({
      update_id: 2,
      message: {
        message_id: 2,
        date: Math.floor(Date.now() / 1000),
        chat: { id: buyerChatId, type: 'private' },
        from: { id: buyerChatId, is_bot: false, first_name: 'Buyer', username: 'buyer_user' },
        text: '100',
      },
    } as any);
    await bot.handleUpdate(makePhotoUpdate(3, buyerChatId, 'photo_mellat_123', 'Ref: 12345678'));

    const [pendingReq] = await db.select().from(topUpRequests);
    return pendingReq!;
  }

  it('happy path: admin clicks Reject -> chooses preset reason -> request is REJECTED, buyer is notified, original admin message edited, wallet unchanged, 0 ledger rows', async () => {
    const { bot, repliedMessages, editedMessages, answeredCallbackQueries } = createTestBot();
    const pendingReq = await setupPendingTopUpFlow(bot);

    // 1. Admin taps Reject button on receipt notification
    await bot.handleUpdate(
      makeCallbackQueryUpdate(
        4,
        adminChatId1,
        `reject:${pendingReq.id}`,
        10,
        'Original receipt notification caption',
        'super_admin'
      )
    );

    // Prompt for rejection reason should be sent to admin
    expect(repliedMessages.some((msg) => msg.includes('دلیل رد') || msg.includes('علت'))).toBe(true);

    // 2. Admin selects preset reason (e.g. wrong_amount)
    await bot.handleUpdate(
      makeCallbackQueryUpdate(
        5,
        adminChatId1,
        'reject_reason:wrong_amount',
        20
      )
    );

    // 3. Verify DB state: REJECTED, rejectionReason = "Wrong amount", wallet = 0.00
    const [rejectedReq] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, pendingReq.id));
    expect(rejectedReq?.status).toBe('REJECTED');
    expect(rejectedReq?.rejectionReason).toBe('Wrong amount');
    expect(rejectedReq?.processedByAdminTelegramId).toBe(BigInt(adminChatId1));

    const [buyerWallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, pendingReq.userId));
    expect(buyerWallet?.availableBalance).toBe('0.00');

    // 4. Verify 0 ledger transactions/entries
    const txRows = await db.select().from(ledgerTransactions);
    expect(txRows).toHaveLength(0);
    const entryRows = await db.select().from(ledgerEntries);
    expect(entryRows).toHaveLength(0);

    // 5. Verify Buyer push notification contains rejection reason
    expect(
      repliedMessages.some(
        (msg) => msg.includes('رد شد') && msg.includes('Wrong amount')
      )
    ).toBe(true);

    // 6. Verify original admin message was edited to show rejection outcome
    const editedNotification = editedMessages.find((m) => m.message_id === 10);
    expect(editedNotification).toBeDefined();
    expect(editedNotification?.caption).toContain('❌');
    expect(editedNotification?.caption).toContain('super_admin');
    expect(editedNotification?.caption).toContain('Wrong amount');
  });

  it('custom note path: admin chooses Other / custom... -> enters free text note -> request is REJECTED with custom note verbatim', async () => {
    const { bot, repliedMessages, editedMessages } = createTestBot();
    const pendingReq = await setupPendingTopUpFlow(bot);

    const customNote = 'Wrong amount — you sent 5,900,000 IRR but the request was for 6,200,000 IRR';

    // 1. Admin taps Reject
    await bot.handleUpdate(
      makeCallbackQueryUpdate(
        4,
        adminChatId1,
        `reject:${pendingReq.id}`,
        10,
        'Original notification caption',
        'super_admin'
      )
    );

    // 2. Admin selects Other / custom...
    await bot.handleUpdate(
      makeCallbackQueryUpdate(
        5,
        adminChatId1,
        'reject_reason:custom',
        20
      )
    );

    // Bot prompts for custom note
    expect(repliedMessages.some((msg) => msg.includes('پیام متنی') || msg.includes('توضیحات'))).toBe(true);

    // 3. Admin sends free-text custom note
    await bot.handleUpdate(
      makeTextUpdate(6, adminChatId1, customNote, 'super_admin')
    );

    // 4. Verify DB state: REJECTED with custom note
    const [rejectedReq] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, pendingReq.id));
    expect(rejectedReq?.status).toBe('REJECTED');
    expect(rejectedReq?.rejectionReason).toBe(customNote);

    // 5. Buyer receives push notification containing custom note verbatim
    expect(
      repliedMessages.some(
        (msg) => msg.includes('رد شد') && msg.includes(customNote)
      )
    ).toBe(true);

    // 6. Original admin notification message edited with custom note
    const editedNotification = editedMessages.find((m) => m.message_id === 10);
    expect(editedNotification).toBeDefined();
    expect(editedNotification?.caption).toContain(customNote);
  });

  it('cancellation via Cancel button leaves request in PENDING status without notifying buyer', async () => {
    const { bot, repliedMessages, editedMessages } = createTestBot();
    const pendingReq = await setupPendingTopUpFlow(bot);

    // 1. Admin taps Reject
    await bot.handleUpdate(
      makeCallbackQueryUpdate(4, adminChatId1, `reject:${pendingReq.id}`, 10)
    );

    // 2. Admin taps Cancel button
    await bot.handleUpdate(
      makeCallbackQueryUpdate(5, adminChatId1, 'reject_reason:cancel', 20)
    );

    // Verify cancellation message replied to admin
    expect(repliedMessages.some((msg) => msg.includes('لغو شد'))).toBe(true);

    // DB state remains PENDING
    const [stillPendingReq] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, pendingReq.id));
    expect(stillPendingReq?.status).toBe('PENDING');
    expect(stillPendingReq?.rejectionReason).toBeNull();

    // Original admin message (message_id = 10) was NOT marked rejected
    expect(editedMessages.filter((m) => m.message_id === 10)).toHaveLength(0);
  });

  it('cancellation via /cancel during custom note input leaves request in PENDING', async () => {
    const { bot, repliedMessages, editedMessages } = createTestBot();
    const pendingReq = await setupPendingTopUpFlow(bot);

    // 1. Admin taps Reject
    await bot.handleUpdate(
      makeCallbackQueryUpdate(4, adminChatId1, `reject:${pendingReq.id}`, 10)
    );

    // 2. Admin selects custom
    await bot.handleUpdate(
      makeCallbackQueryUpdate(5, adminChatId1, 'reject_reason:custom', 20)
    );

    // 3. Admin sends /cancel
    await bot.handleUpdate(makeTextUpdate(6, adminChatId1, '/cancel'));

    // DB state remains PENDING
    const [stillPendingReq] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, pendingReq.id));
    expect(stillPendingReq?.status).toBe('PENDING');
    expect(stillPendingReq?.rejectionReason).toBeNull();
  });

  it('silently ignores reject callback queries from non-Admins', async () => {
    const { bot, editedMessages } = createTestBot();
    const pendingReq = await setupPendingTopUpFlow(bot);

    // Non-admin tries to click Reject
    await bot.handleUpdate(
      makeCallbackQueryUpdate(4, nonAdminChatId, `reject:${pendingReq.id}`, 10)
    );

    // DB state remains PENDING
    const [stillPendingReq] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, pendingReq.id));
    expect(stillPendingReq?.status).toBe('PENDING');

    expect(editedMessages).toHaveLength(0);
  });

  it('multi-Admin race: if request is already approved or rejected, rejecting admin sees already processed outcome', async () => {
    const { bot, editedMessages, repliedMessages } = createTestBot();
    const pendingReq = await setupPendingTopUpFlow(bot);

    // First Admin approves via callback
    await bot.handleUpdate(
      makeCallbackQueryUpdate(4, adminChatId1, `approve:${pendingReq.id}`, 10)
    );

    // Second Admin tries to reject
    await bot.handleUpdate(
      makeCallbackQueryUpdate(5, adminChatId2, `reject:${pendingReq.id}`, 11)
    );

    // Second admin selects preset reason
    await bot.handleUpdate(
      makeCallbackQueryUpdate(6, adminChatId2, 'reject_reason:wrong_amount', 21)
    );

    // Request is still APPROVED
    const [approvedReq] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, pendingReq.id));
    expect(approvedReq?.status).toBe('APPROVED');

    // Second admin sees already processed notification
    expect(
      repliedMessages.some((msg) => msg.includes('قبلاً') || msg.includes('تعیین تکلیف')) ||
        editedMessages.some((m) => m.caption?.includes('قبلاً'))
    ).toBe(true);
  });

  it('buyer push notification failure does not roll back rejection transaction', async () => {
    let failBuyerPush = false;

    const failingFetch: typeof fetch = async (url: any, init?: any) => {
      const urlStr = url.toString();
      const method = urlStr.split('/').pop();
      let body: any = {};
      if (init?.body) {
        try {
          body = JSON.parse(init.body);
        } catch {}
      }

      if (method === 'sendMessage') {
        if (failBuyerPush && Number(body.chat_id) === buyerChatId) {
          throw new Error('Telegram network error on buyer notification');
        }
        return new Response(JSON.stringify({ ok: true, result: { message_id: 1, text: body.text } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (method === 'sendPhoto') {
        return new Response(
          JSON.stringify({
            ok: true,
            result: {
              message_id: 10,
              date: Math.floor(Date.now() / 1000),
              chat: { id: body.chat_id, type: 'private' },
              photo: [{ file_id: body.photo, width: 100, height: 100 }],
              caption: body.caption,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (method === 'editMessageCaption' || method === 'editMessageText') {
        return new Response(JSON.stringify({ ok: true, result: { message_id: body.message_id } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (method === 'answerCallbackQuery') {
        return new Response(JSON.stringify({ ok: true, result: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ ok: true, result: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const { bot } = createTestBot(failingFetch);
    const pendingReq = await setupPendingTopUpFlow(bot);

    failBuyerPush = true;

    // Admin rejects
    await bot.handleUpdate(
      makeCallbackQueryUpdate(4, adminChatId1, `reject:${pendingReq.id}`, 10)
    );
    await bot.handleUpdate(
      makeCallbackQueryUpdate(5, adminChatId1, 'reject_reason:unreadable_receipt', 20)
    );

    // Request is REJECTED in DB despite notification failure
    const [rejectedReq] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, pendingReq.id));
    expect(rejectedReq?.status).toBe('REJECTED');
    expect(rejectedReq?.rejectionReason).toBe('Unreadable receipt');
  });
});
