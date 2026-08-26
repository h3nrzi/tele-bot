import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Decimal from 'decimal.js';
import {
  formatUsd,
  formatIrr,
  computeIrrAmount,
  getTopUpLimits,
  validateTopUpAmount,
} from '../../src/utils/currency';

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
      expect(formatIrr(62000000n)).toBe('62,000,000');
      expect(formatIrr('1234567890')).toBe('1,234,567,890');
      expect(formatIrr(500000)).toBe('500,000');
      expect(formatIrr(new Decimal('75000000'))).toBe('75,000,000');
      expect(formatIrr(0n)).toBe('0');
    });
  });

  describe('computeIrrAmount', () => {
    it('computes round(usd_amount * irr_per_usd) using decimal.js and returns a bigint', () => {
      // 100 USD * 620,000 IRR/USD = 62,000,000 IRR
      expect(computeIrrAmount('100', 620000n)).toBe(62000000n);
      expect(computeIrrAmount(new Decimal('100.50'), 620000n)).toBe(62310000n);

      // Rounding check: 10.33 * 620000 = 6404600
      expect(computeIrrAmount('10.33', 620000n)).toBe(6404600n);

      // Rounding check: 10.333 * 620000 = 6406460
      expect(computeIrrAmount('10.333', 620000n)).toBe(6406460n);
    });
  });

  describe('getTopUpLimits', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('reads and parses TOPUP_MIN_USD, TOPUP_MAX_USD, and TOPUP_INITIATED_EXPIRY_MINUTES from environment', () => {
      process.env.TOPUP_MIN_USD = '10';
      process.env.TOPUP_MAX_USD = '1000';
      process.env.TOPUP_INITIATED_EXPIRY_MINUTES = '45';

      const limits = getTopUpLimits();
      expect(limits.minUsd.toString()).toBe('10');
      expect(limits.maxUsd.toString()).toBe('1000');
      expect(limits.expiryMinutes).toBe(45);
    });

    it('defaults TOPUP_INITIATED_EXPIRY_MINUTES to 30 when omitted', () => {
      process.env.TOPUP_MIN_USD = '5.00';
      process.env.TOPUP_MAX_USD = '500.00';
      delete process.env.TOPUP_INITIATED_EXPIRY_MINUTES;

      const limits = getTopUpLimits();
      expect(limits.expiryMinutes).toBe(30);
    });

    it('throws when TOPUP_MIN_USD is absent', () => {
      delete process.env.TOPUP_MIN_USD;
      process.env.TOPUP_MAX_USD = '1000';

      expect(() => getTopUpLimits()).toThrow(
        /TOPUP_MIN_USD and TOPUP_MAX_USD environment variables are required/i
      );
    });

    it('throws when TOPUP_MAX_USD is absent', () => {
      process.env.TOPUP_MIN_USD = '10';
      delete process.env.TOPUP_MAX_USD;

      expect(() => getTopUpLimits()).toThrow(
        /TOPUP_MIN_USD and TOPUP_MAX_USD environment variables are required/i
      );
    });

    it('throws when TOPUP_MIN_USD is greater than TOPUP_MAX_USD', () => {
      process.env.TOPUP_MIN_USD = '200';
      process.env.TOPUP_MAX_USD = '100';

      expect(() => getTopUpLimits()).toThrow(
        /TOPUP_MIN_USD cannot be greater than TOPUP_MAX_USD/i
      );
    });
  });

  describe('validateTopUpAmount', () => {
    const limits = {
      minUsd: new Decimal('10.00'),
      maxUsd: new Decimal('1000.00'),
    };

    it('accepts valid amounts within [minUsd, maxUsd]', () => {
      const res1 = validateTopUpAmount('10.00', limits);
      expect(res1.valid).toBe(true);
      if (res1.valid) {
        expect(res1.amountDecimal.toString()).toBe('10');
        expect(res1.amountString).toBe('10.00');
      }

      const res2 = validateTopUpAmount('500', limits);
      expect(res2.valid).toBe(true);
      if (res2.valid) {
        expect(res2.amountDecimal.toString()).toBe('500');
        expect(res2.amountString).toBe('500.00');
      }

      const res3 = validateTopUpAmount('1000.00', limits);
      expect(res3.valid).toBe(true);
    });

    it('rejects amounts below minimum', () => {
      const res = validateTopUpAmount('9.99', limits);
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.error).toBe('BELOW_MIN');
        expect(res.message).toContain('minimum');
      }
    });

    it('rejects amounts above maximum', () => {
      const res = validateTopUpAmount('1000.01', limits);
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.error).toBe('ABOVE_MAX');
        expect(res.message).toContain('maximum');
      }
    });

    it('rejects invalid number / string formats', () => {
      const res1 = validateTopUpAmount('abc', limits);
      expect(res1.valid).toBe(false);
      if (!res1.valid) {
        expect(res1.error).toBe('INVALID_FORMAT');
      }

      const res2 = validateTopUpAmount('-15', limits);
      expect(res2.valid).toBe(false);
      if (!res2.valid) {
        expect(res2.error).toBe('BELOW_MIN');
      }
    });
  });
});
