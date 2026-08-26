import { describe, it, expect } from 'vitest';
import { TopUpRequest } from '../../src/domain/top-up/top-up-request.entity';
import {
  TopUpRequestExpiredError,
  TopUpRequestNotPendingError,
} from '../../src/domain/top-up/top-up.errors';

describe('TopUpRequest Aggregate Entity', () => {
  const baseProps = {
    id: 'req-123',
    userId: 'user-456',
    exchangeRateId: 'rate-789',
    usdAmount: '100.00',
    irrAmount: 62000000n,
    status: 'INITIATED' as const,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('initializes correctly with domain value objects and state', () => {
    const request = new TopUpRequest(baseProps);
    expect(request.id).toBe('req-123');
    expect(request.status).toBe('INITIATED');
    expect(request.usdAmount).toBe('100.00');
    expect(request.usdAmountVo.format()).toBe('$100.00');
    expect(request.irrAmount).toBe(62000000n);
    expect(request.irrAmountVo.format()).toBe('62,000,000');
  });

  it('submits receipt and transitions from INITIATED to PENDING', () => {
    const request = new TopUpRequest(baseProps);
    request.submitReceipt('file_xyz', 'Card transfer note');

    expect(request.status).toBe('PENDING');
    expect(request.receiptFileId).toBe('file_xyz');
    expect(request.receiptCaption).toBe('Card transfer note');
  });

  it('throws TopUpRequestExpiredError if receipt is submitted after expiresAt', () => {
    const expiredRequest = new TopUpRequest({
      ...baseProps,
      expiresAt: new Date(Date.now() - 1000),
    });

    expect(() => expiredRequest.submitReceipt('file_xyz')).toThrow(
      TopUpRequestExpiredError
    );
    expect(expiredRequest.status).toBe('EXPIRED');
  });

  it('approves PENDING request and records admin info and timestamp', () => {
    const request = new TopUpRequest(baseProps);
    request.submitReceipt('file_xyz');
    expect(request.status).toBe('PENDING');

    const adminId = 999888n;
    const now = new Date();
    request.approve(adminId, now);

    expect(request.status).toBe('APPROVED');
    expect(request.processedByAdminTelegramId).toBe(adminId);
    expect(request.processedAt).toBe(now);
  });

  it('throws TopUpRequestNotPendingError if approve() is called on non-PENDING request', () => {
    const request = new TopUpRequest(baseProps); // in INITIATED status
    expect(() => request.approve(123n)).toThrow(TopUpRequestNotPendingError);
  });

  it('rejects PENDING request with rejection reason and admin info', () => {
    const request = new TopUpRequest(baseProps);
    request.submitReceipt('file_xyz');

    request.reject(123n, 'Unreadable receipt photo');
    expect(request.status).toBe('REJECTED');
    expect(request.rejectionReason).toBe('Unreadable receipt photo');
  });
});
