import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { users } from '@/db/schema/users';
import { topUpRequests } from '@/db/schema/top-up-requests';
import { setRate } from '@/application/exchange-rate/exchange-rate.service';
import {
  initiateTopUp,
  submitReceipt,
} from '@/application/top-up/top-up.service';
import {
  NoInitiatedTopUpRequestError,
  TopUpRequestExpiredError,
} from '@/domain/top-up/top-up.errors';
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

  async function createTestBuyer(telegramChatId = 987654321n) {
    const [buyer] = await db
      .insert(users)
      .values({
        telegramChatId,
        telegramUsername: 'test_buyer',
      })
      .returning();
    return buyer!;
  }

  it('happy path: transitions status to PENDING and persists receipt_file_id and receipt_caption', async () => {
    const buyer = await createTestBuyer();
    await setRate(adminId, 620000n, db);

    const initResult = await initiateTopUp({ userId: buyer.id, usdAmount: '100.00' }, db);
    expect(initResult.request.status).toBe('INITIATED');

    const submitResult = await submitReceipt(
      {
        userId: buyer.id,
        fileId: 'photo_file_abc123',
        caption: 'Ref: 99887766 Mellat App',
      },
      db
    );

    expect(submitResult).toBeDefined();
    expect(submitResult.request.id).toBe(initResult.request.id);
    expect(submitResult.request.status).toBe('PENDING');
    expect(submitResult.request.receiptFileId).toBe('photo_file_abc123');
    expect(submitResult.request.receiptCaption).toBe('Ref: 99887766 Mellat App');

    // Verify in DB
    const [dbRow] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, initResult.request.id));
    expect(dbRow?.status).toBe('PENDING');
    expect(dbRow?.receiptFileId).toBe('photo_file_abc123');
    expect(dbRow?.receiptCaption).toBe('Ref: 99887766 Mellat App');
  });

  it('stores receipt_caption as null when caption is omitted or null', async () => {
    const buyer = await createTestBuyer();
    await setRate(adminId, 620000n, db);

    const initResult = await initiateTopUp({ userId: buyer.id, usdAmount: '50.00' }, db);

    const submitResult = await submitReceipt(
      {
        userId: buyer.id,
        fileId: 'photo_file_xyz789',
      },
      db
    );

    expect(submitResult.request.status).toBe('PENDING');
    expect(submitResult.request.receiptFileId).toBe('photo_file_xyz789');
    expect(submitResult.request.receiptCaption).toBeNull();

    const [dbRow] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, initResult.request.id));
    expect(dbRow?.receiptCaption).toBeNull();
  });

  it('expired request: transitions status to EXPIRED, throws TopUpRequestExpiredError, and performs no partial receipt writes', async () => {
    const buyer = await createTestBuyer();
    await setRate(adminId, 620000n, db);

    const initResult = await initiateTopUp({ userId: buyer.id, usdAmount: '100.00' }, db);

    // Simulate expired time: now is 1 minute past expiresAt
    const simulatedNow = new Date(initResult.request.expiresAt.getTime() + 60 * 1000);

    await expect(
      submitReceipt(
        {
          userId: buyer.id,
          fileId: 'photo_file_late',
          caption: 'Late transfer receipt',
        },
        db,
        { now: simulatedNow }
      )
    ).rejects.toThrow(TopUpRequestExpiredError);

    // Verify DB status transitioned to EXPIRED and receipt fields remain NULL
    const [dbRow] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, initResult.request.id));
    expect(dbRow?.status).toBe('EXPIRED');
    expect(dbRow?.receiptFileId).toBeNull();
    expect(dbRow?.receiptCaption).toBeNull();
  });

  it('throws NoInitiatedTopUpRequestError and mutates no DB records when no INITIATED request exists', async () => {
    const buyer = await createTestBuyer();

    // No request at all
    await expect(
      submitReceipt(
        {
          userId: buyer.id,
          fileId: 'photo_file_123',
        },
        db
      )
    ).rejects.toThrow(NoInitiatedTopUpRequestError);

    const rows = await db.select().from(topUpRequests);
    expect(rows).toHaveLength(0);
  });

  it('throws NoInitiatedTopUpRequestError when request is already PENDING', async () => {
    const buyer = await createTestBuyer();
    await setRate(adminId, 620000n, db);

    const initResult = await initiateTopUp({ userId: buyer.id, usdAmount: '100.00' }, db);

    // Move to PENDING
    await submitReceipt(
      {
        userId: buyer.id,
        fileId: 'first_receipt',
      },
      db
    );

    // Second submission attempt
    await expect(
      submitReceipt(
        {
          userId: buyer.id,
          fileId: 'second_receipt',
        },
        db
      )
    ).rejects.toThrow(NoInitiatedTopUpRequestError);

    // Ensure first receipt is preserved
    const [dbRow] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, initResult.request.id));
    expect(dbRow?.receiptFileId).toBe('first_receipt');
  });
});
