import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { users } from '@/modules/buyer/buyer.schema';
import { topUpRequests } from '@/modules/top-up/top-up.schema';
import { setRate } from '@/modules/exchange-rate/exchange-rate.service';
import {
  initiateTopUp,
  submitReceipt,
} from '@/modules/top-up/top-up.service';
import {
  NoInitiatedTopUpRequestError,
  TopUpRequestExpiredError,
} from '@/modules/top-up/top-up.errors';
import { eq } from 'drizzle-orm';

describe('Receipt Submission Service', () => {
  const { db } = setupTestDatabase();
  const adminId = 123456789n;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.TOPUP_MIN_USD = '10.00';
    process.env.TOPUP_MAX_USD = '1000.00';
    process.env.TOPUP_INITIATED_EXPIRY_MINUTES = '30';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  async function seedInitiatedRequest() {
    const [user] = await db
      .insert(users)
      .values({
        telegramChatId: 987654321n,
        telegramUsername: 'testbuyer',
      })
      .returning();

    await setRate({ adminTelegramId: adminId, irrPerUsd: 600000n }, db);

    const { request } = await initiateTopUp(
      {
        userId: user!.id,
        usdAmount: '50.00',
      },
      db
    );

    return { user: user!, request };
  }

  it('submits receipt photo and updates status to PENDING atomically', async () => {
    const { user, request } = await seedInitiatedRequest();

    const result = await submitReceipt(
      {
        userId: user.id,
        fileId: 'telegram_photo_file_id_xyz',
        caption: 'Paid from Card ending in 4455',
      },
      db
    );

    expect(result).toBeDefined();
    expect(result.request.id).toBe(request.id);
    expect(result.request.status).toBe('PENDING');
    expect(result.request.receiptFileId).toBe('telegram_photo_file_id_xyz');
    expect(result.request.receiptCaption).toBe('Paid from Card ending in 4455');

    // Verify in DB
    const [row] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, request.id));
    expect(row!.status).toBe('PENDING');
    expect(row!.receiptFileId).toBe('telegram_photo_file_id_xyz');
    expect(row!.receiptCaption).toBe('Paid from Card ending in 4455');
  });

  it('throws NoInitiatedTopUpRequestError when user has no active INITIATED request', async () => {
    const [user] = await db
      .insert(users)
      .values({
        telegramChatId: 111222333n,
        telegramUsername: 'emptybuyer',
      })
      .returning();

    await expect(
      submitReceipt(
        {
          userId: user!.id,
          fileId: 'photo_123',
        },
        db
      )
    ).rejects.toThrow(NoInitiatedTopUpRequestError);
  });

  it('throws NoInitiatedTopUpRequestError when request is already in PENDING state (disallows duplicate submission)', async () => {
    const { user } = await seedInitiatedRequest();

    // First submission succeeds
    await submitReceipt({ userId: user.id, fileId: 'photo_1' }, db);

    // Second submission throws
    await expect(
      submitReceipt({ userId: user.id, fileId: 'photo_2' }, db)
    ).rejects.toThrow(NoInitiatedTopUpRequestError);
  });

  it('throws TopUpRequestExpiredError and marks request as EXPIRED if expires_at has passed', async () => {
    const { user, request } = await seedInitiatedRequest();

    // Force expires_at to the past
    const past = new Date(Date.now() - 5 * 60 * 1000);
    await db
      .update(topUpRequests)
      .set({ expiresAt: past })
      .where(eq(topUpRequests.id, request.id));

    await expect(
      submitReceipt({ userId: user.id, fileId: 'photo_expired' }, db)
    ).rejects.toThrow(TopUpRequestExpiredError);

    // Verify status was updated to EXPIRED in database
    const [row] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, request.id));
    expect(row!.status).toBe('EXPIRED');
  });

  it('handles submission without caption (caption = null)', async () => {
    const { user, request } = await seedInitiatedRequest();

    const result = await submitReceipt(
      {
        userId: user.id,
        fileId: 'photo_no_caption',
      },
      db
    );

    expect(result.request.status).toBe('PENDING');
    expect(result.request.receiptCaption).toBeNull();
  });
});
