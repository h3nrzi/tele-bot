import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { setRate } from '@/application/exchange-rate/exchange-rate.service';
import {
  initiateTopUp,
  submitReceipt,
  approveTopUp,
  rejectTopUp,
  cancelTopUp,
  getPendingRequests,
} from '@/application/top-up/top-up.service';
import { registerBuyer } from '@/application/buyer/registration.service';
import { topUpRequests } from '@/db/schema/top-up-requests';
import { eq } from 'drizzle-orm';

describe('Admin Pending Top-Up Queue Service', () => {
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

  async function createBuyer(chatId: bigint, username: string) {
    const { buyer, wallet } = await registerBuyer(
      {
        telegramChatId: chatId,
        telegramUsername: username,
      },
      db
    );
    return { buyer, wallet };
  }

  it('empty queue: returns an empty array when no requests exist', async () => {
    const pending = await getPendingRequests(db);
    expect(pending).toEqual([]);
  });

  it('single PENDING request: returns single pending request with joined buyer details', async () => {
    await setRate(adminId, 620000n, db);
    const { buyer } = await createBuyer(987654321n, 'buyer_one');

    const { request: initReq } = await initiateTopUp(
      { userId: buyer.id, usdAmount: '50.00' },
      db
    );
    await submitReceipt(
      { userId: buyer.id, fileId: 'receipt_file_1', caption: 'Paid via Mellat' },
      db
    );

    const pending = await getPendingRequests(db);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.id).toBe(initReq.id);
    expect(pending[0]?.userId).toBe(buyer.id);
    expect(pending[0]?.telegramChatId).toBe(987654321n);
    expect(pending[0]?.telegramUsername).toBe('buyer_one');
    expect(pending[0]?.usdAmount).toBe('50.00');
    expect(pending[0]?.irrAmount).toBe(31000000n);
    expect(pending[0]?.status).toBe('PENDING');
    expect(pending[0]?.receiptFileId).toBe('receipt_file_1');
    expect(pending[0]?.receiptCaption).toBe('Paid via Mellat');
  });

  it('multiple PENDING requests: returned in ascending creation order (oldest first)', async () => {
    await setRate(adminId, 620000n, db);
    const { buyer: buyer1 } = await createBuyer(1001n, 'buyer_1');
    const { buyer: buyer2 } = await createBuyer(1002n, 'buyer_2');
    const { buyer: buyer3 } = await createBuyer(1003n, 'buyer_3');

    // Create request 1
    const { request: req1 } = await initiateTopUp({ userId: buyer1.id, usdAmount: '10.00' }, db);
    await submitReceipt({ userId: buyer1.id, fileId: 'file_1' }, db);

    // Create request 2
    const { request: req2 } = await initiateTopUp({ userId: buyer2.id, usdAmount: '20.00' }, db);
    await submitReceipt({ userId: buyer2.id, fileId: 'file_2' }, db);

    // Create request 3
    const { request: req3 } = await initiateTopUp({ userId: buyer3.id, usdAmount: '30.00' }, db);
    await submitReceipt({ userId: buyer3.id, fileId: 'file_3' }, db);

    // Explicitly update created_at timestamps to guarantee distinct ascending order
    const t1 = new Date('2026-08-27T10:00:00Z');
    const t2 = new Date('2026-08-27T10:05:00Z');
    const t3 = new Date('2026-08-27T10:10:00Z');

    await db.update(topUpRequests).set({ createdAt: t1 }).where(eq(topUpRequests.id, req1.id));
    await db.update(topUpRequests).set({ createdAt: t2 }).where(eq(topUpRequests.id, req2.id));
    await db.update(topUpRequests).set({ createdAt: t3 }).where(eq(topUpRequests.id, req3.id));

    const pending = await getPendingRequests(db);
    expect(pending).toHaveLength(3);
    expect(pending[0]?.id).toBe(req1.id);
    expect(pending[0]?.telegramUsername).toBe('buyer_1');
    expect(pending[1]?.id).toBe(req2.id);
    expect(pending[1]?.telegramUsername).toBe('buyer_2');
    expect(pending[2]?.id).toBe(req3.id);
    expect(pending[2]?.telegramUsername).toBe('buyer_3');
  });

  it('filters non-PENDING requests: INITIATED, APPROVED, REJECTED, EXPIRED, CANCELLED are excluded', async () => {
    await setRate(adminId, 620000n, db);
    const { buyer: buyerPending } = await createBuyer(2001n, 'buyer_pending');
    const { buyer: buyerInitiated } = await createBuyer(2002n, 'buyer_initiated');
    const { buyer: buyerApproved } = await createBuyer(2003n, 'buyer_approved');
    const { buyer: buyerRejected } = await createBuyer(2004n, 'buyer_rejected');
    const { buyer: buyerCancelled } = await createBuyer(2005n, 'buyer_cancelled');
    const { buyer: buyerExpired } = await createBuyer(2006n, 'buyer_expired');

    // 1. PENDING request (should be included)
    const { request: pendingReq } = await initiateTopUp(
      { userId: buyerPending.id, usdAmount: '100.00' },
      db
    );
    await submitReceipt({ userId: buyerPending.id, fileId: 'pending_receipt' }, db);

    // 2. INITIATED request (should be excluded)
    await initiateTopUp({ userId: buyerInitiated.id, usdAmount: '50.00' }, db);

    // 3. APPROVED request (should be excluded)
    const { request: reqApproved } = await initiateTopUp(
      { userId: buyerApproved.id, usdAmount: '60.00' },
      db
    );
    await submitReceipt({ userId: buyerApproved.id, fileId: 'approved_receipt' }, db);
    await approveTopUp({ topUpRequestId: reqApproved.id, adminTelegramId: adminId }, db);

    // 4. REJECTED request (should be excluded)
    const { request: reqRejected } = await initiateTopUp(
      { userId: buyerRejected.id, usdAmount: '70.00' },
      db
    );
    await submitReceipt({ userId: buyerRejected.id, fileId: 'rejected_receipt' }, db);
    await rejectTopUp(
      {
        topUpRequestId: reqRejected.id,
        adminTelegramId: adminId,
        rejectionReason: 'Invalid transaction',
      },
      db
    );

    // 5. CANCELLED request (should be excluded)
    await initiateTopUp({ userId: buyerCancelled.id, usdAmount: '80.00' }, db);
    await cancelTopUp({ userId: buyerCancelled.id }, db);

    // 6. EXPIRED request (should be excluded)
    const { request: reqExpired } = await initiateTopUp(
      { userId: buyerExpired.id, usdAmount: '90.00' },
      db
    );
    await db
      .update(topUpRequests)
      .set({ status: 'EXPIRED' })
      .where(eq(topUpRequests.id, reqExpired.id));

    const pending = await getPendingRequests(db);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.id).toBe(pendingReq.id);
    expect(pending[0]?.telegramUsername).toBe('buyer_pending');
  });
});
