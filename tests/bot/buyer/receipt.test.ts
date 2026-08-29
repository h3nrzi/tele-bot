import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { createMockFetch, type MockSentPhoto } from '@tests/helpers/mock-context';
import { createBot } from '@/bot/bot';
import { setTestRate, setTestActiveAccount } from '@tests/helpers/fixtures';
import { topUpRequests } from '@/modules/top-up/top-up.schema';
import { eq } from 'drizzle-orm';

describe('Receipt Submission & Admin Push Notification Handler', () => {
  const { db, container } = setupTestDatabase();
  const adminChatId1 = 111222333;
  const adminChatId2 = 444555666;
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

  function makePhotoUpdate(
    updateId: number,
    chatId: number,
    fileId: string,
    caption?: string,
    username = 'buyer_user'
  ) {
    return {
      update_id: updateId,
      message: {
        message_id: updateId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: 'private', first_name: 'Buyer' },
        from: { id: chatId, is_bot: false, first_name: 'Buyer', username },
        photo: [
          { file_id: `${fileId}_thumb`, width: 90, height: 90 },
          { file_id: fileId, width: 800, height: 800 },
        ],
        caption,
      },
    } as any;
  }

  function makeCommandUpdate(updateId: number, chatId: number, text: string) {
    return {
      update_id: updateId,
      message: {
        message_id: updateId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: 'private', first_name: 'Buyer' },
        from: { id: chatId, is_bot: false, first_name: 'Buyer', username: 'buyer_user' },
        text,
        entities: [{ offset: 0, length: text.length, type: 'bot_command' }],
      },
    } as any;
  }

  function createTestBot(mockFetchOverride?: typeof fetch) {
    const repliedMessages: string[] = [];
    const sentPhotos: MockSentPhoto[] = [];

    const mockFetch =
      mockFetchOverride ||
      createMockFetch(repliedMessages, sentPhotos).fetch;

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
    return { bot, repliedMessages, sentPhotos, mockFetch };
  }

  it('happy path: buyer submits receipt photo with caption -> PENDING transition + admin notifications with Approve/Reject inline keyboard', async () => {
    await setTestRate(container, BigInt(adminChatId1), 620000n);
    await setTestActiveAccount(
      container,
      {
        cardNumber: '6037991234567890',
        cardHolderName: 'Ali Reza',
        bankName: 'Mellat Bank',
      }
    );

    const { bot, repliedMessages, sentPhotos } = createTestBot();

    // 1. Buyer initiates /topup
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

    // 2. Buyer uploads photo receipt
    await bot.handleUpdate(
      makePhotoUpdate(3, buyerChatId, 'photo_mellat_123', 'Ref: 12345678')
    );

    // Verify buyer received receipt submitted confirmation
    expect(repliedMessages.some((msg) => msg.includes('رسید پرداخت شما با موفقیت ثبت شد'))).toBe(true);

    // Verify DB record
    const [requestRow] = await db.select().from(topUpRequests);
    expect(requestRow).toBeDefined();
    expect(requestRow?.status).toBe('PENDING');
    expect(requestRow?.receiptFileId).toBe('photo_mellat_123');
    expect(requestRow?.receiptCaption).toBe('Ref: 12345678');

    // Verify admin notifications
    expect(sentPhotos).toHaveLength(2);
    const admin1Photo = sentPhotos.find((p) => Number(p.chat_id) === adminChatId1);
    const admin2Photo = sentPhotos.find((p) => Number(p.chat_id) === adminChatId2);

    expect(admin1Photo).toBeDefined();
    expect(admin2Photo).toBeDefined();

    expect(admin1Photo?.photo).toBe('photo_mellat_123');
    expect(admin1Photo?.caption).toContain('@buyer_user');
    expect(admin1Photo?.caption).toContain('$100.00');
    expect(admin1Photo?.caption).toContain('62,000,000');
    expect(admin1Photo?.caption).toContain('Ref: 12345678');

    // Verify inline keyboard buttons
    const keyboard = admin1Photo?.reply_markup?.inline_keyboard;
    expect(keyboard).toBeDefined();
    const flatButtons = keyboard.flat();
    const approveBtn = flatButtons.find((btn: any) =>
      btn.callback_data === `approve:${requestRow?.id}`
    );
    const rejectBtn = flatButtons.find((btn: any) =>
      btn.callback_data === `reject:${requestRow?.id}`
    );
    expect(approveBtn).toBeDefined();
    expect(rejectBtn).toBeDefined();
  });

  it('expired request: buyer uploads photo after expiry -> EXPIRED transition + expiry error message to Buyer + no admin notification', async () => {
    await setTestRate(container, BigInt(adminChatId1), 620000n);
    await setTestActiveAccount(
      container,
      {
        cardNumber: '6037991234567890',
        cardHolderName: 'Ali Reza',
        bankName: 'Mellat Bank',
      }
    );

    const { bot, repliedMessages, sentPhotos } = createTestBot();

    // 1. Buyer initiates /topup
    await bot.handleUpdate(makeCommandUpdate(1, buyerChatId, '/topup'));
    await bot.handleUpdate({
      update_id: 2,
      message: {
        message_id: 2,
        date: Math.floor(Date.now() / 1000),
        chat: { id: buyerChatId, type: 'private' },
        from: { id: buyerChatId, is_bot: false, first_name: 'Buyer', username: 'buyer_user' },
        text: '50',
      },
    } as any);

    // Force expires_at into the past
    const [requestRow] = await db.select().from(topUpRequests);
    const past = new Date(Date.now() - 10 * 60 * 1000);
    await db
      .update(topUpRequests)
      .set({ expiresAt: past })
      .where(eq(topUpRequests.id, requestRow!.id));

    // 2. Buyer uploads photo after expiry
    await bot.handleUpdate(makePhotoUpdate(3, buyerChatId, 'photo_expired'));

    // Verify buyer received expired message
    expect(repliedMessages.some((msg) => msg.includes('مهلت پرداخت') || msg.includes('منقضی'))).toBe(true);

    // Verify DB record transitioned to EXPIRED
    const [updatedRow] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, requestRow!.id));
    expect(updatedRow?.status).toBe('EXPIRED');

    // Verify no admin notifications sent
    expect(sentPhotos).toHaveLength(0);
  });

  it('no active request: buyer sends photo without having an INITIATED top-up -> prompt with instructions', async () => {
    const { bot, repliedMessages, sentPhotos } = createTestBot();

    await bot.handleUpdate(makePhotoUpdate(1, buyerChatId, 'photo_random'));

    expect(repliedMessages.some((msg) => msg.includes('هیچ درخواست افزایش موجودی فعالی'))).toBe(true);
    expect(sentPhotos).toHaveLength(0);
  });

  it('already pending: buyer sends second photo when request is already PENDING -> contextual explanation reply', async () => {
    await setTestRate(container, BigInt(adminChatId1), 620000n);
    await setTestActiveAccount(
      container,
      {
        cardNumber: '6037991234567890',
        cardHolderName: 'Ali Reza',
        bankName: 'Mellat Bank',
      }
    );

    const { bot, repliedMessages, sentPhotos } = createTestBot();

    // 1. Topup and photo 1
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
    await bot.handleUpdate(makePhotoUpdate(3, buyerChatId, 'photo_1'));

    expect(sentPhotos).toHaveLength(2); // Sent to 2 admins

    // 2. Photo 2
    await bot.handleUpdate(makePhotoUpdate(4, buyerChatId, 'photo_2'));

    expect(repliedMessages.some((msg) => msg.includes('قبلاً رسید پرداخت خود را ارسال کرده‌اید'))).toBe(true);
    // No additional admin notification sent
    expect(sentPhotos).toHaveLength(2);
  });

  it('admin notification failure does not roll back PENDING DB transition', async () => {
    await setTestRate(container, BigInt(adminChatId1), 620000n);
    await setTestActiveAccount(
      container,
      {
        cardNumber: '6037991234567890',
        cardHolderName: 'Ali Reza',
        bankName: 'Mellat Bank',
      }
    );

    const repliedMessages: string[] = [];
    const mockFetch: typeof fetch = async (url: any, init?: any) => {
      const urlStr = url.toString();
      const method = urlStr.split('/').pop();
      let body: any = {};
      if (init?.body) {
        try {
          body = JSON.parse(init.body);
        } catch {}
      }
      if (method === 'sendMessage') {
        if (body.text) repliedMessages.push(body.text);
        return new Response(
          JSON.stringify({
            ok: true,
            result: {
              message_id: 1,
              date: Math.floor(Date.now() / 1000),
              chat: { id: body.chat_id, type: 'private' },
              text: body.text,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (method === 'sendPhoto') {
        // Simulate network failure when sending photo to admins
        throw new Error('Telegram network error');
      }
      return new Response(JSON.stringify({ ok: true, result: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const bot = createBot({
      token: 'test_token',
      dbClient: db,
      adminIds: `${adminChatId1},${adminChatId2}`,
      client: { fetch: mockFetch },
      botInfo: {
        id: 1000,
        is_bot: true,
        first_name: 'TeleBot',
        username: 'tele_bot',
      } as any,
    });

    // 1. Buyer initiates /topup
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

    // 2. Buyer uploads photo (even though sendPhoto throws)
    await bot.handleUpdate(makePhotoUpdate(3, buyerChatId, 'photo_mellat_fail'));

    // Buyer still receives confirmation
    expect(repliedMessages.some((msg) => msg.includes('رسید پرداخت شما با موفقیت ثبت شد'))).toBe(true);

    // DB state is still PENDING
    const [requestRow] = await db.select().from(topUpRequests);
    expect(requestRow?.status).toBe('PENDING');
    expect(requestRow?.receiptFileId).toBe('photo_mellat_fail');
  });
});
