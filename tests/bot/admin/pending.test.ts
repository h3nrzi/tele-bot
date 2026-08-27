import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDatabase } from '../../helpers/test-db';
import {
  createMockFetch,
  type MockSentPhoto,
  type MockEditedMessage,
  type MockAnsweredCallbackQuery,
} from '../../helpers/mock-context';
import { createBot } from '../../../src/bot/bot';
import { setRate } from '../../../src/application/exchange-rate/exchange-rate.service';
import { setActiveAccount } from '../../../src/application/bank-account/bank-account.service';
import { topUpRequests } from '../../../src/db/schema/top-up-requests';
import { wallets } from '../../../src/db/schema/wallets';
import { ledgerTransactions, ledgerEntries } from '../../../src/db/schema/ledger';
import {
  getEmptyPendingQueueMessage,
  formatBuyerApprovalMessage,
} from '../../../src/bot/modules/admin';
import { eq } from 'drizzle-orm';

describe('/pending Admin Queue and Review Callback', () => {
  const { db } = setupTestDatabase();
  const adminChatId = 111222333;
  const nonAdminChatId = 999888777;
  const buyerChatId = 987654321;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.ADMIN_IDS = `${adminChatId}`;
    process.env.TOPUP_MIN_USD = '10.00';
    process.env.TOPUP_MAX_USD = '1000.00';
    process.env.TOPUP_INITIATED_EXPIRY_MINUTES = '30';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function makeCommandUpdate(updateId: number, chatId: number, text: string, username = 'buyer_user') {
    const commandLength = text.indexOf(' ') > 0 ? text.indexOf(' ') : text.length;
    return {
      update_id: updateId,
      message: {
        message_id: updateId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: 'private', first_name: 'User' },
        from: { id: chatId, is_bot: false, first_name: 'User', username },
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
    fromChatId: number,
    data: string,
    messageId = 20,
    caption = ''
  ) {
    return {
      update_id: updateId,
      callback_query: {
        id: `cb_query_${updateId}`,
        from: {
          id: fromChatId,
          is_bot: false,
          first_name: 'Admin',
          username: 'admin_user',
        },
        message: {
          message_id: messageId,
          date: Math.floor(Date.now() / 1000),
          chat: { id: fromChatId, type: 'private' },
          caption,
          text: caption,
        },
        data,
        chat_instance: 'instance_queue_123',
      },
    } as any;
  }

  function createTestBot() {
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
      adminIds: `${adminChatId}`,
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
      sentPhotos,
      editedMessages,
      answeredCallbackQueries,
    };
  }

  it('/pending on empty queue replies with empty queue message', async () => {
    const { bot, repliedMessages } = createTestBot();

    await bot.handleUpdate(makeCommandUpdate(1, adminChatId, '/pending'));

    expect(repliedMessages).toHaveLength(1);
    expect(repliedMessages[0]).toBe(getEmptyPendingQueueMessage());
  });

  it('/pending with pending requests formats list with summary and Review button', async () => {
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

    // 1. Buyer initiates topup and uploads receipt
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
    await bot.handleUpdate(makePhotoUpdate(3, buyerChatId, 'receipt_photo_xyz', 'Trans Ref: 998877'));

    const [pendingReq] = await db.select().from(topUpRequests);
    expect(pendingReq).toBeDefined();

    // 2. Admin sends /pending
    await bot.handleUpdate(makeCommandUpdate(4, adminChatId, '/pending'));

    // Admin should receive queue message containing buyer handle, amounts, and summary
    const queueMsg = repliedMessages.find((m) => m.includes('صف درخواست‌های در انتظار'));
    expect(queueMsg).toBeDefined();
    expect(queueMsg).toContain('@buyer_user');
    expect(queueMsg).toContain('$100.00');
    expect(queueMsg).toContain('62,000,000');
  });

  it('/pending pagination: >10 requests are paginated with Next and Prev buttons', async () => {
    await setRate(BigInt(adminChatId), 620000n, db);
    await setActiveAccount(
      {
        cardNumber: '6037991234567890',
        cardHolderName: 'Ali Reza',
        bankName: 'Mellat Bank',
      },
      db
    );

    const { bot, repliedMessages, editedMessages, answeredCallbackQueries } = createTestBot();

    // Create 12 pending requests from 12 distinct buyers
    for (let i = 1; i <= 12; i++) {
      const bChatId = 900000 + i;
      await bot.handleUpdate(makeCommandUpdate(100 + i, bChatId, '/topup', `buyer_${i}`));
      await bot.handleUpdate({
        update_id: 200 + i,
        message: {
          message_id: 200 + i,
          date: Math.floor(Date.now() / 1000),
          chat: { id: bChatId, type: 'private' },
          from: { id: bChatId, is_bot: false, first_name: `Buyer${i}`, username: `buyer_${i}` },
          text: '50',
        },
      } as any);
      await bot.handleUpdate(makePhotoUpdate(300 + i, bChatId, `photo_${i}`));
    }

    // Admin sends /pending
    await bot.handleUpdate(makeCommandUpdate(500, adminChatId, '/pending', 'admin_user'));

    const page1Msg = repliedMessages[repliedMessages.length - 1];
    expect(page1Msg).toContain('صفحه 1 از 2');
    expect(page1Msg).toContain('مجموع: 12 مورد');
    expect(page1Msg).toContain('buyer_1');
    expect(page1Msg).toContain('buyer_10');
    expect(page1Msg).not.toContain('buyer_11');

    // Admin clicks Next -> (pending_page:2)
    await bot.handleUpdate(makeCallbackQueryUpdate(501, adminChatId, 'pending_page:2', 50));

    expect(editedMessages).toHaveLength(1);
    expect(editedMessages[0]?.text).toContain('صفحه 2 از 2');
    expect(editedMessages[0]?.text).toContain('buyer_11');
    expect(editedMessages[0]?.text).toContain('buyer_12');
    expect(answeredCallbackQueries).toHaveLength(1);

    // Admin clicks Prev <- (pending_page:1)
    await bot.handleUpdate(makeCallbackQueryUpdate(502, adminChatId, 'pending_page:1', 50));

    expect(editedMessages).toHaveLength(2);
    expect(editedMessages[1]?.text).toContain('صفحه 1 از 2');
    expect(editedMessages[1]?.text).toContain('buyer_1');
  });

  it('Review button callback: re-sends receipt photo with Approve/Reject buttons, allowing admin approval directly', async () => {
    await setRate(BigInt(adminChatId), 620000n, db);
    await setActiveAccount(
      {
        cardNumber: '6037991234567890',
        cardHolderName: 'Ali Reza',
        bankName: 'Mellat Bank',
      },
      db
    );

    const {
      bot,
      sentPhotos,
      repliedMessages,
      editedMessages,
      answeredCallbackQueries,
    } = createTestBot();

    // 1. Buyer submits receipt
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
    await bot.handleUpdate(makePhotoUpdate(3, buyerChatId, 'photo_review_flow_123', 'Tracking 4455'));

    const [pendingReq] = await db.select().from(topUpRequests);
    expect(pendingReq).toBeDefined();

    // Initial photo was sent to admin on receipt submission
    expect(sentPhotos).toHaveLength(1);

    // 2. Admin triggers Review callback
    await bot.handleUpdate(
      makeCallbackQueryUpdate(4, adminChatId, `review:${pendingReq!.id}`, 15)
    );

    // Re-sent photo should now be in sentPhotos (total 2)
    expect(sentPhotos).toHaveLength(2);
    const reSentPhoto = sentPhotos[1];
    expect(reSentPhoto?.photo).toBe('photo_review_flow_123');
    expect(reSentPhoto?.caption).toContain('مبلغ درخواستی: $100.00');
    expect(reSentPhoto?.caption).toContain('Tracking 4455');
    expect(reSentPhoto?.reply_markup?.inline_keyboard).toEqual([
      [
        { text: '✅ Approve', callback_data: `approve:${pendingReq!.id}` },
        { text: '❌ Reject', callback_data: `reject:${pendingReq!.id}` },
      ],
    ]);

    // 3. Admin clicks Approve on the re-sent message
    await bot.handleUpdate(
      makeCallbackQueryUpdate(
        5,
        adminChatId,
        `approve:${pendingReq!.id}`,
        reSentPhoto?.chat_id ? 25 : 25,
        reSentPhoto?.caption ?? ''
      )
    );

    // Verify DB transition to APPROVED
    const [approvedReq] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, pendingReq!.id));
    expect(approvedReq?.status).toBe('APPROVED');

    // Verify Buyer wallet was credited
    const [buyerWallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, pendingReq!.userId));
    expect(buyerWallet?.availableBalance).toBe('100.00');

    // Verify ledger
    const txRows = await db.select().from(ledgerTransactions);
    expect(txRows).toHaveLength(1);
    const entryRows = await db.select().from(ledgerEntries);
    expect(entryRows).toHaveLength(2);

    // Verify Buyer push notification
    const buyerNotification = formatBuyerApprovalMessage({
      usdAmount: '100.00',
      availableBalance: '100.00',
    });
    expect(repliedMessages).toContain(buyerNotification);
  });

  it('silently ignores /pending, review, and pending_page callbacks from non-Admins', async () => {
    await setRate(BigInt(adminChatId), 620000n, db);
    await setActiveAccount(
      {
        cardNumber: '6037991234567890',
        cardHolderName: 'Ali Reza',
        bankName: 'Mellat Bank',
      },
      db
    );

    const { bot, repliedMessages, sentPhotos, answeredCallbackQueries } = createTestBot();

    // 1. Buyer submits receipt
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
    await bot.handleUpdate(makePhotoUpdate(3, buyerChatId, 'photo_non_admin_queue'));

    const [pendingReq] = await db.select().from(topUpRequests);

    // 2. Non-admin sends /pending
    await bot.handleUpdate(makeCommandUpdate(4, nonAdminChatId, '/pending'));

    // 3. Non-admin sends review callback
    await bot.handleUpdate(
      makeCallbackQueryUpdate(5, nonAdminChatId, `review:${pendingReq!.id}`)
    );

    // 4. Non-admin sends pagination callback
    await bot.handleUpdate(
      makeCallbackQueryUpdate(6, nonAdminChatId, 'pending_page:2')
    );

    // Should not reply to /pending from non-admin
    const nonAdminReplies = repliedMessages.filter((m) =>
      m.includes('صف درخواست‌های در انتظار')
    );
    expect(nonAdminReplies).toHaveLength(0);

    // sentPhotos should only have 1 (the initial receipt notification to admin)
    expect(sentPhotos).toHaveLength(1);

    // answeredCallbackQueries should have 0 answers for non-admin updates (adminAuth blocks it)
    expect(answeredCallbackQueries).toHaveLength(0);
  });

  it('Review callback on non-existent requestId answers with alert', async () => {
    const { bot, answeredCallbackQueries } = createTestBot();

    await bot.handleUpdate(
      makeCallbackQueryUpdate(1, adminChatId, 'review:00000000-0000-0000-0000-000000000000')
    );

    expect(answeredCallbackQueries).toHaveLength(1);
    expect(answeredCallbackQueries[0]?.show_alert).toBe(true);
    expect(answeredCallbackQueries[0]?.text).toContain('یافت نشد');
  });

  it('Pagination callback when queue has become empty edits message to empty queue message', async () => {
    const { bot, editedMessages, answeredCallbackQueries } = createTestBot();

    await bot.handleUpdate(
      makeCallbackQueryUpdate(1, adminChatId, 'pending_page:2')
    );

    expect(editedMessages).toHaveLength(1);
    expect(editedMessages[0]?.text).toBe(getEmptyPendingQueueMessage());
    expect(answeredCallbackQueries).toHaveLength(1);
  });
});

