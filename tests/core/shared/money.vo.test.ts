import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { UsdAmount, IrrAmount } from '@/core/shared/money.vo';

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

    it('throws DomainError on invalid non-numeric inputs', () => {
      expect(() => new UsdAmount('invalid')).toThrow();
      expect(() => new UsdAmount('abc')).toThrow();
    });
  });

  describe('IrrAmount', () => {
    it('wraps bigint and formats with Persian/comma separators', () => {
      const irr = new IrrAmount(60000000n);
      expect(irr.toBigInt()).toBe(60000000n);
      expect(irr.format()).toBe('60,000,000');
    });
  });
});
