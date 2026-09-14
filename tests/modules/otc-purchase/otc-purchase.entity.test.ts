import { describe, it, expect } from 'vitest';
import { OtcPurchase } from '@/modules/otc-purchase/otc-purchase.entity';
import { InvalidOtcPurchaseStateError } from '@/modules/otc-purchase/otc-purchase.errors';
import { UsdAmount } from '@/core/shared/money.vo';

describe('Domain Entity: OtcPurchase', () => {
  const now = new Date();

  function createPendingPurchase(overrides?: Partial<ConstructorParameters<typeof OtcPurchase>[0]>) {
    return new OtcPurchase({
      id: 'otc-1',
      topUpRequestId: 'req-1',
      usdtQuantity: new UsdAmount('50.00'),
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
      ...overrides,
    });
  }

  it('initializes in PENDING status with null execution details', () => {
    const purchase = createPendingPurchase();

    expect(purchase.id).toBe('otc-1');
    expect(purchase.topUpRequestId).toBe('req-1');
    expect(purchase.usdtQuantity).toBe('50.00');
    expect(purchase.usdtQuantityVo.format()).toBe('$50.00');
    expect(purchase.status).toBe('PENDING');
    expect(purchase.isPending()).toBe(true);
    expect(purchase.isCompleted()).toBe(false);
    expect(purchase.isFailed()).toBe(false);
    expect(purchase.wallexClientOrderId).toBeNull();
    expect(purchase.wallexExecutedPrice).toBeNull();
    expect(purchase.wallexExecutedQty).toBeNull();
    expect(purchase.wallexExecutedSum).toBeNull();
    expect(purchase.wallexFee).toBeNull();
    expect(purchase.errorMessage).toBeNull();
  });

  it('transitions to COMPLETED on complete() with execution details', () => {
    const purchase = createPendingPurchase();
    const completedAt = new Date(now.getTime() + 5000);

    purchase.complete(
      {
        wallexClientOrderId: 'order-12345',
        wallexExecutedPrice: 600000n,
        wallexExecutedQty: '50.00',
        wallexExecutedSum: 30000000n,
        wallexFee: 30000n,
      },
      completedAt
    );

    expect(purchase.status).toBe('COMPLETED');
    expect(purchase.isPending()).toBe(false);
    expect(purchase.isCompleted()).toBe(true);
    expect(purchase.isFailed()).toBe(false);
    expect(purchase.wallexClientOrderId).toBe('order-12345');
    expect(purchase.wallexExecutedPrice).toBe(600000n);
    expect(purchase.wallexExecutedQty).toBe('50.00');
    expect(purchase.wallexExecutedSum).toBe(30000000n);
    expect(purchase.wallexFee).toBe(30000n);
    expect(purchase.errorMessage).toBeNull();
    expect(purchase.updatedAt).toEqual(completedAt);
  });

  it('transitions to FAILED on fail() with error message', () => {
    const purchase = createPendingPurchase();
    const failedAt = new Date(now.getTime() + 5000);

    purchase.fail('Insufficient TMN balance in Wallex account', failedAt);

    expect(purchase.status).toBe('FAILED');
    expect(purchase.isPending()).toBe(false);
    expect(purchase.isCompleted()).toBe(false);
    expect(purchase.isFailed()).toBe(true);
    expect(purchase.errorMessage).toBe('Insufficient TMN balance in Wallex account');
    expect(purchase.updatedAt).toEqual(failedAt);
  });

  it('throws error when trying to complete or fail a non-PENDING purchase', () => {
    const purchase = createPendingPurchase();
    purchase.complete({
      wallexClientOrderId: 'order-12345',
      wallexExecutedPrice: 600000n,
      wallexExecutedQty: '50.00',
      wallexExecutedSum: 30000000n,
      wallexFee: 30000n,
    });

    expect(() =>
      purchase.complete({
        wallexClientOrderId: 'order-second',
        wallexExecutedPrice: 600000n,
        wallexExecutedQty: '50.00',
        wallexExecutedSum: 30000000n,
        wallexFee: 30000n,
      })
    ).toThrow(InvalidOtcPurchaseStateError);

    expect(() => purchase.fail('Some error')).toThrow(
      InvalidOtcPurchaseStateError
    );
  });
});
