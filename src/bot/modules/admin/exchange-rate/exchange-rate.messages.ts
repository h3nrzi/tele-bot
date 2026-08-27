import type { Context } from 'grammy';

/**
 * Returns the message showing the current Exchange Rate and when it was set.
 */
export function getCurrentRateMessage(
  rate: { irrPerUsd: bigint | number; createdAt: Date }
): string {
  const formatted = rate.irrPerUsd.toLocaleString('en-US');
  return `نرخ فعلی:\n1 USD = ${formatted} IRR\n\nزمان ثبت:\n${rate.createdAt.toISOString()}`;
}

/**
 * Returns the message sent when no Exchange Rate has been configured yet.
 */
export function getNoRateConfiguredMessage(): string {
  return 'در حال حاضر هیچ نرخ ارزی تنظیم نشده است. از دستور /setrate <irr_amount> برای تنظیم نرخ استفاده کنید.';
}

/**
 * Returns the confirmation message sent to the Admin after successfully updating the Exchange Rate.
 */
export function getSetRateSuccessMessage(irrPerUsd: bigint | number): string {
  const formatted = irrPerUsd.toLocaleString('en-US');
  return `نرخ ارز به‌روزرسانی شد: 1 USD = ${formatted} IRR`;
}

/**
 * Returns the usage error message sent to the Admin when /setrate arguments are invalid or missing.
 */
export function getSetRateUsageErrorMessage(): string {
  return 'فرمت نامعتبر است. نحوه استفاده: /setrate <irr_amount>\nمثال: /setrate 620000 (باید یک عدد صحیح مثبت باشد).';
}

/**
 * Parses and validates the raw exchange rate argument string as a positive bigint.
 * Returns null if the argument is missing, non-numeric, zero, or negative.
 */
export function parseSetRateArg(raw: string | undefined | null): bigint | null {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const value = BigInt(trimmed);
  if (value <= 0n) {
    return null;
  }

  return value;
}

/**
 * Extracts the argument string passed to /setrate from either ctx.match or ctx.message.text.
 */
export function extractSetRateArgument(ctx: Context): string | undefined {
  if (typeof ctx.match === 'string') {
    return ctx.match.trim();
  }

  if (ctx.message?.text) {
    const parts = ctx.message.text.trim().split(/\s+/);
    if (parts.length > 1) {
      return parts.slice(1).join(' ').trim();
    }
    return '';
  }

  return undefined;
}
