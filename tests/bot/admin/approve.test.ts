import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import {
  createMockFetch,
  type MockSentPhoto,
  type MockEditedMessage,
  type MockAnsweredCallbackQuery,
} from '@tests/helpers/mock-context';
import { createBot } from '@/bot/bot';
import { setRate } from '@/modules/exchange-rate/exchange-rate.service';
import { setActiveAccount } from '@/modules/bank-account/bank-account.service';
import { topUpRequests } from '@/modules/top-up/top-up.schema';
import { wallets } from '@/modules/wallet/wallet.schema';
import { ledgerTransactions, ledgerEntries } from '@/modules/ledger/ledger.schema';
import {
  formatBuyerApprovalMessage,
} from '@/bot/handlers/admin';
import { eq } from 'drizzle-orm';

describe('Admin Approval Callback Handler', () => {
  const { db } = setupTestDatabase();
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

  it('happy path: admin clicks Approve button -> updates request to APPROVED, writes ledger entries, credits buyer wallet, sends buyer push notification, and edits admin notification message', async () => {
    await setRate(BigInt(adminChatId1), 620000n, db);
    await setActiveAccount(
      {
        cardNumber: '6037991234567890',
        cardHolderName: 'Ali Reza',
        bankName: 'Mellat Bank',
      },
      db
    );

    const { bot, repliedMessages, editedMessages, answeredCallbackQueries } = createTestBot();

    // 1. Buyer initiates /topup and uploads photo
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

    // Check request is PENDING
    const [pendingReq] = await db.select().from(topUpRequests);
    expect(pendingReq).toBeDefined();
    expect(pendingReq?.status).toBe('PENDING');

    // 2. Admin 1 taps Approve
    await bot.handleUpdate(
      makeCallbackQueryUpdate(
        4,
        adminChatId1,
        `approve:${pendingReq!.id}`,
        10,
        'Original notification caption',
        'super_admin'
      )
    );

    // 3. Verify DB state: APPROVED, wallet balance = $100.00
    const [approvedReq] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, pendingReq!.id));
    expect(approvedReq?.status).toBe('APPROVED');
    expect(approvedReq?.processedByAdminTelegramId).toBe(BigInt(adminChatId1));

    const [buyerWallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, pendingReq!.userId));
    expect(buyerWallet?.availableBalance).toBe('100.00');

    // 4. Verify ledger entries
    const txRows = await db.select().from(ledgerTransactions);
    expect(txRows).toHaveLength(1);
    const entryRows = await db.select().from(ledgerEntries);
    expect(entryRows).toHaveLength(2);

    // 5. Verify Buyer push notification
    const buyerNotification = formatBuyerApprovalMessage({
      usdAmount: '100.00',
      availableBalance: '100.00',
    });
    expect(repliedMessages).toContain(buyerNotification);

    // 6. Verify admin message was edited to show approved outcome and remove inline buttons
    expect(editedMessages).toHaveLength(1);
    expect(editedMessages[0]?.message_id).toBe(10);
    expect(editedMessages[0]?.caption).toContain('✅');
    expect(editedMessages[0]?.caption).toContain('super_admin');

    // 7. Verify callback query was answered
    expect(answeredCallbackQueries).toHaveLength(1);
    expect(answeredCallbackQueries[0]?.callback_query_id).toBe('cb_query_4');
  });

  it('multi-admin race: second admin tap shows "already processed" and does not credit wallet again', async () => {
    await setRate(BigInt(adminChatId1), 620000n, db);
    await setActiveAccount(
      {
        cardNumber: '6037991234567890',
        cardHolderName: 'Ali Reza',
        bankName: 'Mellat Bank',
      },
      db
    );

    const { bot, editedMessages, answeredCallbackQueries } = createTestBot();

    // 1. Buyer initiates and submits receipt
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
    await bot.handleUpdate(makePhotoUpdate(3, buyerChatId, 'photo_race_123'));

    const [pendingReq] = await db.select().from(topUpRequests);

    // 2. Admin 1 approves
    await bot.handleUpdate(
      makeCallbackQueryUpdate(4, adminChatId1, `approve:${pendingReq!.id}`, 10)
    );

    // 3. Admin 2 taps Approve on the same request
    await bot.handleUpdate(
      makeCallbackQueryUpdate(5, adminChatId2, `approve:${pendingReq!.id}`, 11)
    );

    // Verify DB still only has 1 ledger transaction and wallet has $100.00
    const txRows = await db.select().from(ledgerTransactions);
    expect(txRows).toHaveLength(1);

    const [buyerWallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, pendingReq!.userId));
    expect(buyerWallet?.availableBalance).toBe('100.00');

    // Verify Admin 2 saw "already processed"
    expect(answeredCallbackQueries).toHaveLength(2);
    expect(answeredCallbackQueries[1]?.text).toMatch(/قبلاً|already/i);

    // Verify message 11 was edited to show already processed
    expect(editedMessages).toHaveLength(2);
    expect(editedMessages[1]?.caption).toMatch(/قبلاً|already/i);
  });

  it('silently ignores callback queries from non-Admins', async () => {
    await setRate(BigInt(adminChatId1), 620000n, db);
    await setActiveAccount(
      {
        cardNumber: '6037991234567890',
        cardHolderName: 'Ali Reza',
        bankName: 'Mellat Bank',
      },
      db
    );

    const { bot, editedMessages, answeredCallbackQueries } = createTestBot();

    // 1. Buyer initiates and submits receipt
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
    await bot.handleUpdate(makePhotoUpdate(3, buyerChatId, 'photo_non_admin_test'));

    const [pendingReq] = await db.select().from(topUpRequests);

    // 2. Non-admin user tries to send approve callback
    await bot.handleUpdate(
      makeCallbackQueryUpdate(4, nonAdminChatId, `approve:${pendingReq!.id}`, 10)
    );

    // DB state must remain PENDING
    const [stillPendingReq] = await db.select().from(topUpRequests);
    expect(stillPendingReq?.status).toBe('PENDING');

    const txRows = await db.select().from(ledgerTransactions);
    expect(txRows).toHaveLength(0);

    expect(editedMessages).toHaveLength(0);
    expect(answeredCallbackQueries).toHaveLength(0);
  });

  it('buyer push notification failure does not roll back approval transaction', async () => {
    await setRate(BigInt(adminChatId1), 620000n, db);
    await setActiveAccount(
      {
        cardNumber: '6037991234567890',
        cardHolderName: 'Ali Reza',
        bankName: 'Mellat Bank',
      },
      db
    );

    const repliedMessages: string[] = [];
    const editedMessages: MockEditedMessage[] = [];
    const answeredCallbackQueries: MockAnsweredCallbackQuery[] = [];
    let failBuyerPush = false;

    // Custom fetch that throws only when failBuyerPush is true and sending to buyer
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
        if (body.text) repliedMessages.push(body.text);
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

      if (method === 'editMessageCaption') {
        editedMessages.push({
          chat_id: body.chat_id,
          message_id: body.message_id,
          caption: body.caption,
        });
        return new Response(JSON.stringify({ ok: true, result: { message_id: body.message_id } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (method === 'answerCallbackQuery') {
        answeredCallbackQueries.push({
          callback_query_id: body.callback_query_id,
          text: body.text,
        });
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

    // 1. Buyer initiates and submits receipt
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
    await bot.handleUpdate(makePhotoUpdate(3, buyerChatId, 'photo_fail_notif'));

    const [pendingReq] = await db.select().from(topUpRequests);

    // Now enable notification failure
    failBuyerPush = true;

    // 2. Admin approves
    await bot.handleUpdate(
      makeCallbackQueryUpdate(4, adminChatId1, `approve:${pendingReq!.id}`, 10)
    );

    // 3. Verify DB state is still APPROVED despite notification failure
    const [approvedReq] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, pendingReq!.id));
    expect(approvedReq?.status).toBe('APPROVED');

    const [buyerWallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, pendingReq!.userId));
    expect(buyerWallet?.availableBalance).toBe('100.00');

    // 4. Verify admin message was still edited and callback answered
    expect(editedMessages).toHaveLength(1);
    expect(answeredCallbackQueries).toHaveLength(1);
  });
});
