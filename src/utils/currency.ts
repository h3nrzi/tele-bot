import Decimal from 'decimal.js';

/**
 * Formats a USD amount string or Decimal into a standard USD currency string (e.g. '$0.00').
 */
export function formatUsd(amount: string | Decimal): string {
  const dec = amount instanceof Decimal ? amount : new Decimal(amount);
  return `$${dec.toFixed(2)}`;
}

/**
 * Formats an IRR amount (bigint, number, string, or Decimal) as an integer with thousands separators (e.g. '62,000,000').
 */
export function formatIrr(amount: bigint | number | string | Decimal): string {
  let str: string;
  if (typeof amount === 'bigint') {
    str = amount.toString();
  } else if (amount instanceof Decimal) {
    str = amount.toFixed(0);
  } else if (typeof amount === 'number') {
    str = Math.round(amount).toString();
  } else {
    str = new Decimal(amount).toFixed(0);
  }

  // Insert thousands separators
  const parts = str.split('.');
  parts[0] = parts[0]!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts[0]!;
}

/**
 * Computes round(usd_amount * irr_per_usd) using decimal.js and returns a bigint.
 */
export function computeIrrAmount(
  usdAmount: string | Decimal,
  irrPerUsd: bigint | number | string | Decimal
): bigint {
  const usd = usdAmount instanceof Decimal ? usdAmount : new Decimal(usdAmount);
  const rate =
    irrPerUsd instanceof Decimal
      ? irrPerUsd
      : new Decimal(irrPerUsd.toString());

  const computed = usd.times(rate).round();
  return BigInt(computed.toFixed(0));
}

export interface TopUpLimits {
  minUsd: Decimal;
  maxUsd: Decimal;
  expiryMinutes: number;
}

/**
 * Reads TOPUP_MIN_USD, TOPUP_MAX_USD, and TOPUP_INITIATED_EXPIRY_MINUTES from environment.
 * Throws an error if required variables are missing or invalid.
 */
export function getTopUpLimits(env: NodeJS.ProcessEnv = process.env): TopUpLimits {
  const rawMin = env.TOPUP_MIN_USD;
  const rawMax = env.TOPUP_MAX_USD;

  if (!rawMin || !rawMax) {
    throw new Error(
      'TOPUP_MIN_USD and TOPUP_MAX_USD environment variables are required'
    );
  }

  let minUsd: Decimal;
  let maxUsd: Decimal;

  try {
    minUsd = new Decimal(rawMin);
    maxUsd = new Decimal(rawMax);
  } catch {
    throw new Error('TOPUP_MIN_USD and TOPUP_MAX_USD must be valid decimal numbers');
  }

  if (minUsd.lte(0)) {
    throw new Error('TOPUP_MIN_USD must be greater than zero');
  }

  if (minUsd.gt(maxUsd)) {
    throw new Error('TOPUP_MIN_USD cannot be greater than TOPUP_MAX_USD');
  }

  const rawExpiry = env.TOPUP_INITIATED_EXPIRY_MINUTES;
  let expiryMinutes = 30;
  if (rawExpiry) {
    const parsed = parseInt(rawExpiry, 10);
    if (!isNaN(parsed) && parsed > 0) {
      expiryMinutes = parsed;
    }
  }

  return {
    minUsd,
    maxUsd,
    expiryMinutes,
  };
}

export type ValidateTopUpAmountResult =
  | { valid: true; amountDecimal: Decimal; amountString: string }
  | {
      valid: false;
      error: 'INVALID_FORMAT' | 'BELOW_MIN' | 'ABOVE_MAX' | 'NON_POSITIVE';
      message: string;
    };

/**
 * Validates a user-supplied USD top-up amount against configured min and max limits using decimal.js.
 */
export function validateTopUpAmount(
  rawAmount: string | Decimal,
  limits: { minUsd: Decimal | string; maxUsd: Decimal | string }
): ValidateTopUpAmountResult {
  const min = limits.minUsd instanceof Decimal ? limits.minUsd : new Decimal(limits.minUsd);
  const max = limits.maxUsd instanceof Decimal ? limits.maxUsd : new Decimal(limits.maxUsd);

  let dec: Decimal;
  try {
    if (typeof rawAmount === 'string') {
      const trimmed = rawAmount.trim().replace(/^\$/, '');
      if (!trimmed) {
        return {
          valid: false,
          error: 'INVALID_FORMAT',
          message: 'فرمت مبلغ نامعتبر است. لطفاً یک عدد معتبر وارد کنید (مانند 50 یا 50.00).',
        };
      }
      dec = new Decimal(trimmed);
    } else {
      dec = rawAmount;
    }
  } catch {
    return {
      valid: false,
      error: 'INVALID_FORMAT',
      message: 'فرمت مبلغ نامعتبر است. لطفاً یک عدد معتبر وارد کنید (مانند 50 یا 50.00).',
    };
  }

  if (dec.isNaN()) {
    return {
      valid: false,
      error: 'INVALID_FORMAT',
      message: 'فرمت مبلغ نامعتبر است. لطفاً یک عدد معتبر وارد کنید (مانند 50 یا 50.00).',
    };
  }

  if (dec.lte(0) || dec.isNaN()) {
    return {
      valid: false,
      error: 'BELOW_MIN',
      message: `حداقل مبلغ افزایش موجودی ${formatUsd(min)} است.`,
    };
  }

  if (dec.lt(min)) {
    return {
      valid: false,
      error: 'BELOW_MIN',
      message: `حداقل مبلغ افزایش موجودی ${formatUsd(min)} است.`,
    };
  }

  if (dec.gt(max)) {
    return {
      valid: false,
      error: 'ABOVE_MAX',
      message: `حداکثر مبلغ افزایش موجودی ${formatUsd(max)} است.`,
    };
  }

  return {
    valid: true,
    amountDecimal: dec,
    amountString: dec.toFixed(2),
  };
}

