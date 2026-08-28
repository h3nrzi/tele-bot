import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Decimal from 'decimal.js';
import {
  formatUsd,
  formatIrr,
  computeIrrAmount,
  validateTopUpAmount,
} from '@/core/shared/currency.utils';
import { TopUpLimits } from '@/modules/top-up/top-up.limits.vo';

describe('Currency & Amount Validation Utilities', () => {
  describe('formatUsd', () => {
    it('formats string and Decimal to USD currency string with 2 decimal places', () => {
      expect(formatUsd('10')).toBe('$10.00');
      expect(formatUsd('10.5')).toBe('$10.50');
      expect(formatUsd('10.555')).toBe('$10.56');
      expect(formatUsd('100')).toBe('$100.00');
      expect(formatUsd(new Decimal('250.75'))).toBe('$250.75');
      expect(formatUsd('0')).toBe('$0.00');
    });
  });

  describe('formatIrr', () => {
    it('formats integer IRR values with thousands separators', () => {
      expect(formatIrr(1000n)).toBe('1,000');
      expect(formatIrr(600000n)).toBe('600,000');
      expect(formatIrr(60000000n)).toBe('60,000,000');
      expect(formatIrr(0n)).toBe('0');
      expect(formatIrr(123456789012345n)).toBe('123,456,789,012,345');
    });
  });

  describe('computeIrrAmount', () => {
    it('computes exact IRR integer from USD decimal string and IRR per USD integer', () => {
      // 100 USD * 600,000 IRR/USD = 60,000,000 IRR
      expect(computeIrrAmount('100', 600000n)).toBe(60000000n);
      // 50.50 USD * 600,000 = 30,300,000 IRR
      expect(computeIrrAmount('50.50', 600000n)).toBe(30300000n);
      // 10.25 USD * 625,000 = 6,406,250 IRR
      expect(computeIrrAmount('10.25', 625000n)).toBe(6406250n);
    });

    it('handles rounding to nearest integer without fractional Rial loss', () => {
      // 10.333333 * 600000 = 6,199,999.8 -> rounds to 6,200,000
      expect(computeIrrAmount('10.333333', 600000n)).toBe(6200000n);
    });
  });

  describe('TopUpLimits', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('reads custom valid limits from environment variables', () => {
      process.env.TOPUP_MIN_USD = '20';
      process.env.TOPUP_MAX_USD = '500';
      const limits = TopUpLimits.fromEnv();
      expect(limits.minUsd.toDecimal().toNumber()).toBe(20);
      expect(limits.maxUsd.toDecimal().toNumber()).toBe(500);
    });

    it('throws error when TOPUP_MIN_USD is non-positive or not a number', () => {
      process.env.TOPUP_MIN_USD = '0';
      process.env.TOPUP_MAX_USD = '1000';
      expect(() => TopUpLimits.fromEnv()).toThrow();

      process.env.TOPUP_MIN_USD = '-5';
      expect(() => TopUpLimits.fromEnv()).toThrow();

      process.env.TOPUP_MIN_USD = 'abc';
      expect(() => TopUpLimits.fromEnv()).toThrow();
    });

    it('throws error when TOPUP_MAX_USD is less than TOPUP_MIN_USD', () => {
      process.env.TOPUP_MIN_USD = '100';
      process.env.TOPUP_MAX_USD = '50';
      expect(() => TopUpLimits.fromEnv()).toThrow();
    });
  });

  describe('validateTopUpAmount', () => {
    const limits = {
      minUsd: new Decimal(10),
      maxUsd: new Decimal(1000),
    };

    it('accepts valid integer and decimal USD amounts within [min, max]', () => {
      const res1 = validateTopUpAmount('10', limits);
      expect(res1.valid).toBe(true);
      if (res1.valid) {
        expect(res1.amountDecimal.toNumber()).toBe(10);
        expect(res1.amountString).toBe('10.00');
      }

      const res2 = validateTopUpAmount('500.50', limits);
      expect(res2.valid).toBe(true);
      if (res2.valid) {
        expect(res2.amountDecimal.toNumber()).toBe(500.5);
        expect(res2.amountString).toBe('500.50');
      }

      const res3 = validateTopUpAmount('1000', limits);
      expect(res3.valid).toBe(true);
      if (res3.valid) {
        expect(res3.amountDecimal.toNumber()).toBe(1000);
        expect(res3.amountString).toBe('1000.00');
      }
    });

    it('rejects amounts strictly less than min limit with user-friendly message', () => {
      const res = validateTopUpAmount('9.99', limits);
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.message).toContain('حداقل');
        expect(res.message).toContain('$10.00');
      }
    });

    it('rejects amounts strictly greater than max limit with user-friendly message', () => {
      const res = validateTopUpAmount('1000.01', limits);
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.message).toContain('حداکثر');
        expect(res.message).toContain('$1000.00');
      }
    });

    it('rejects non-numeric inputs, negative numbers, and special characters', () => {
      expect(validateTopUpAmount('abc', limits).valid).toBe(false);
      expect(validateTopUpAmount('-10', limits).valid).toBe(false);
      expect(validateTopUpAmount('$10', limits).valid).toBe(true);
      expect(validateTopUpAmount('10$', limits).valid).toBe(false);
      expect(validateTopUpAmount('   ', limits).valid).toBe(false);
      expect(validateTopUpAmount('', limits).valid).toBe(false);
      expect(validateTopUpAmount('NaN', limits).valid).toBe(false);
    });
  });
});
