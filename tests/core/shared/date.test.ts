import { describe, it, expect } from 'vitest';
import {
  formatPersianDateTime,
  formatPersianDate,
  formatPersianTime,
  formatTimeAgo,
} from '@/core/shared/date.utils';

describe('Date Utilities', () => {
  describe('formatPersianDateTime', () => {
    it('formats a Date into Persian date and time in Asia/Tehran timezone', () => {
      // 2026-09-02T08:45:05.265Z + 03:30 = 2026-09-02 12:15:05 -> 1405/06/11 12:15:05
      const date = new Date('2026-09-02T08:45:05.265Z');
      expect(formatPersianDateTime(date)).toBe('1405/06/11 12:15:05');
    });

    it('formats an ISO date string directly', () => {
      expect(formatPersianDateTime('2026-09-02T08:45:05.265Z')).toBe(
        '1405/06/11 12:15:05'
      );
    });

    it('formats a numeric millisecond timestamp', () => {
      const timestamp = new Date('2026-09-02T08:45:05.265Z').getTime();
      expect(formatPersianDateTime(timestamp)).toBe('1405/06/11 12:15:05');
    });

    it('supports includeSeconds: false', () => {
      const date = new Date('2026-09-02T08:45:05.265Z');
      expect(formatPersianDateTime(date, { includeSeconds: false })).toBe(
        '1405/06/11 12:15'
      );
    });

    it('supports custom separator', () => {
      const date = new Date('2026-09-02T08:45:05.265Z');
      expect(formatPersianDateTime(date, { separator: ' - ' })).toBe(
        '1405/06/11 - 12:15:05'
      );
    });

    it('supports Persian digits when usePersianDigits is true', () => {
      const date = new Date('2026-09-02T08:45:05.265Z');
      expect(formatPersianDateTime(date, { usePersianDigits: true })).toBe(
        '۱۴۰۵/۰۶/۱۱ ۱۲:۱۵:۰۵'
      );
    });

    it('returns empty string for null, undefined, or invalid date', () => {
      expect(formatPersianDateTime(null)).toBe('');
      expect(formatPersianDateTime(undefined)).toBe('');
      expect(formatPersianDateTime('not-a-date')).toBe('');
      expect(formatPersianDateTime(new Date('invalid'))).toBe('');
    });
  });

  describe('formatPersianDate', () => {
    it('returns only the Persian date part (YYYY/MM/DD)', () => {
      const date = new Date('2026-09-02T08:45:05.265Z');
      expect(formatPersianDate(date)).toBe('1405/06/11');
    });

    it('supports Persian digits for date only', () => {
      const date = new Date('2026-09-02T08:45:05.265Z');
      expect(formatPersianDate(date, { usePersianDigits: true })).toBe(
        '۱۴۰۵/۰۶/۱۱'
      );
    });

    it('returns empty string for invalid date', () => {
      expect(formatPersianDate(null)).toBe('');
    });
  });

  describe('formatPersianTime', () => {
    it('returns only the time part with seconds by default', () => {
      const date = new Date('2026-09-02T08:45:05.265Z');
      expect(formatPersianTime(date)).toBe('12:15:05');
    });

    it('returns time without seconds when includeSeconds is false', () => {
      const date = new Date('2026-09-02T08:45:05.265Z');
      expect(formatPersianTime(date, { includeSeconds: false })).toBe('12:15');
    });

    it('returns empty string for invalid date', () => {
      expect(formatPersianTime(null)).toBe('');
    });
  });

  describe('formatTimeAgo', () => {
    const baseNow = new Date('2026-09-02T12:00:00.000Z');

    it('returns "لحظاتی پیش" for durations less than 1 minute', () => {
      const date = new Date(baseNow.getTime() - 30 * 1000);
      expect(formatTimeAgo(date, baseNow)).toBe('لحظاتی پیش');
    });

    it('returns "X دقیقه پیش" for durations under 1 hour', () => {
      const date = new Date(baseNow.getTime() - 15 * 60 * 1000);
      expect(formatTimeAgo(date, baseNow)).toBe('15 دقیقه پیش');
    });

    it('returns "X ساعت پیش" for durations under 24 hours', () => {
      const date = new Date(baseNow.getTime() - 3 * 60 * 60 * 1000);
      expect(formatTimeAgo(date, baseNow)).toBe('3 ساعت پیش');
    });

    it('returns "X روز پیش" for durations 24 hours or more', () => {
      const date = new Date(baseNow.getTime() - 48 * 60 * 60 * 1000);
      expect(formatTimeAgo(date, baseNow)).toBe('2 روز پیش');
    });

    it('returns empty string for invalid dates', () => {
      expect(formatTimeAgo('invalid')).toBe('');
    });
  });
});
