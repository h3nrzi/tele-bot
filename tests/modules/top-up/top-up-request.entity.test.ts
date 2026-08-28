import { describe, it, expect } from 'vitest';
import { TopUpRequest } from '@/modules/top-up/top-up-request.entity';
import { UsdAmount, IrrAmount } from '@/core/shared/money.vo';
import {
  TopUpRequestExpiredError,
  TopUpRequestNotPendingError,
  CannotCancelPendingTopUpError,
} from '@/modules/top-up/top-up.errors';

describe('Domain Entity: TopUpRequest State Machine', () => {
  const expiresAtFuture = new Date(Date.now() + 15 * 60 * 1000);
  const now = new Date();

  function createSampleInitiatedRequest(overrides?: Partial<ConstructorParameters<typeof TopUpRequest>[0]>) {
    return new TopUpRequest({
      id: 'req-1',
      userId: 'user-1',
      usdAmount: new UsdAmount('50.00'),
      irrAmount: new IrrAmount(30000000n),
      exchangeRateId: 'rate-1',
      status: 'INITIATED',
      expiresAt: expiresAtFuture,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    });
  }

  it('initializes in INITIATED state', () => {
    const req = createSampleInitiatedRequest();
    expect(req.status).toBe('INITIATED');
    expect(req.usdAmount).toBe('50.00');
    expect(req.irrAmount).toBe(30000000n);
    expect(req.usdAmountVo.format()).toBe('$50.00');
    expect(req.irrAmountVo.format()).toBe('30,000,000');
  });

  it('transitions to PENDING on receipt submission', () => {
    const req = createSampleInitiatedRequest();
    req.submitReceipt('photo_file_123', 'Paid via Mellat app');

    expect(req.status).toBe('PENDING');
    expect(req.receiptFileId).toBe('photo_file_123');
    expect(req.receiptCaption).toBe('Paid via Mellat app');
  });

  it('transitions to APPROVED on admin approval', () => {
    const req = createSampleInitiatedRequest({ status: 'PENDING', receiptFileId: 'file-1' });
    req.approve(123456789n);

    expect(req.status).toBe('APPROVED');
    expect(req.processedByAdminTelegramId).toBe(123456789n);
    expect(req.processedAt).toBeInstanceOf(Date);
  });

  it('transitions to REJECTED on admin rejection with reason', () => {
    const req = createSampleInitiatedRequest({ status: 'PENDING', receiptFileId: 'file-1' });
    req.reject(123456789n, 'Invalid transaction tracking code');

    expect(req.status).toBe('REJECTED');
    expect(req.processedByAdminTelegramId).toBe(123456789n);
    expect(req.rejectionReason).toBe('Invalid transaction tracking code');
  });

  it('transitions to CANCELLED by buyer when in INITIATED state', () => {
    const req = createSampleInitiatedRequest();
    req.cancel();

    expect(req.status).toBe('CANCELLED');
  });

  it('throws error when attempting invalid state transitions', () => {
    const req = createSampleInitiatedRequest();
    // Cannot approve directly from INITIATED
    expect(() => req.approve(123456789n)).toThrow(TopUpRequestNotPendingError);

    // Cannot reject directly from INITIATED
    expect(() => req.reject(123456789n, 'Reason')).toThrow(TopUpRequestNotPendingError);

    req.submitReceipt('f1');
    // Cannot cancel from PENDING
    expect(() => req.cancel()).toThrow(CannotCancelPendingTopUpError);
    // Cannot submit receipt again from PENDING
    expect(() => req.submitReceipt('f2')).toThrow();
  });

  it('checks expiration accurately and throws on expired receipt submission', () => {
    const pastExpiresAt = new Date(Date.now() - 1000);
    const expiredReq = createSampleInitiatedRequest({ expiresAt: pastExpiresAt });

    expect(expiredReq.isExpired()).toBe(true);

    expect(() => expiredReq.submitReceipt('f_expired')).toThrow(TopUpRequestExpiredError);
    expect(expiredReq.status).toBe('EXPIRED');
  });
});
