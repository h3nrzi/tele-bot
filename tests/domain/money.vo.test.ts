import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { UsdAmount, IrrAmount } from '@/domain/shared/money.vo';

describe('Domain Value Objects: UsdAmount & IrrAmount', () => {
  describe('UsdAmount', () => {
    it('initializes from string, number, or Decimal and formats with 2 decimals and $', () => {
      const a1 = new UsdAmount('10.50');
      const a2 = new UsdAmount(25.75);
      const a3 = new UsdAmount(new Decimal('100.00'));

      expect(a1.format()).toBe('$10.50');
      expect(a1.toFixed(2)).toBe('10.50');
      expect(a2.format()).toBe('$25.75');
      expect(a3.format()).toBe('$100.00');
    });

    it('performs exact addition and subtraction without floating point artifacts', () => {
      const a1 = new UsdAmount('10.10');
      const a2 = new UsdAmount('20.20');
      const sum = a1.plus(a2);
      expect(sum.toFixed(2)).toBe('30.30');

      const diff = sum.minus('10.10');
      expect(diff.toFixed(2)).toBe('20.20');
    });

    it('supports comparison methods (lt, lte, gt, gte, equals, isPositive)', () => {
      const a1 = new UsdAmount('10.00');
      const a2 = new UsdAmount('20.00');
      const a3 = new UsdAmount('10.00');

      expect(a1.lt(a2)).toBe(true);
      expect(a2.gt(a1)).toBe(true);
      expect(a1.equals(a3)).toBe(true);
      expect(a1.isPositive()).toBe(true);
      expect(UsdAmount.zero().isPositive()).toBe(false);
      expect(UsdAmount.zero().isZero()).toBe(true);
    });
  });

  describe('IrrAmount', () => {
    it('initializes from bigint, number, or Decimal and formats with thousands separators', () => {
      const irr1 = new IrrAmount(62000000n);
      const irr2 = new IrrAmount('1234567890');
      const irr3 = new IrrAmount(500000);

      expect(irr1.format()).toBe('62,000,000');
      expect(irr1.toBigInt()).toBe(62000000n);
      expect(irr2.format()).toBe('1,234,567,890');
      expect(irr3.format()).toBe('500,000');
    });
  });
});
