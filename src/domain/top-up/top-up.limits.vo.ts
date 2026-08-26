import Decimal from 'decimal.js';
import { UsdAmount } from '../shared/money.vo';

export type ValidateTopUpAmountResult =
  | { valid: true; amount: UsdAmount; amountDecimal: Decimal; amountString: string }
  | {
      valid: false;
      error: 'INVALID_FORMAT' | 'BELOW_MIN' | 'ABOVE_MAX' | 'NON_POSITIVE';
      message: string;
    };

/**
 * TopUpLimits Value Object.
 * Encapsulates minimum, maximum, and expiration window constraints for Top-Up Requests.
 */
export class TopUpLimits {
  public readonly minUsd: UsdAmount;
  public readonly maxUsd: UsdAmount;
  public readonly expiryMinutes: number;

  constructor(minUsd: UsdAmount | Decimal | string, maxUsd: UsdAmount | Decimal | string, expiryMinutes = 30) {
    this.minUsd = minUsd instanceof UsdAmount ? minUsd : new UsdAmount(minUsd);
    this.maxUsd = maxUsd instanceof UsdAmount ? maxUsd : new UsdAmount(maxUsd);
    this.expiryMinutes = expiryMinutes;

    if (!this.minUsd.isPositive()) {
      throw new Error('TOPUP_MIN_USD must be greater than zero');
    }

    if (this.minUsd.gt(this.maxUsd)) {
      throw new Error('TOPUP_MIN_USD cannot be greater than TOPUP_MAX_USD');
    }
  }

  public static fromEnv(env: NodeJS.ProcessEnv = process.env): TopUpLimits {
    const rawMin = env.TOPUP_MIN_USD;
    const rawMax = env.TOPUP_MAX_USD;

    if (!rawMin || !rawMax) {
      throw new Error('TOPUP_MIN_USD and TOPUP_MAX_USD environment variables are required');
    }

    let minUsd: Decimal;
    let maxUsd: Decimal;

    try {
      minUsd = new Decimal(rawMin);
      maxUsd = new Decimal(rawMax);
    } catch {
      throw new Error('TOPUP_MIN_USD and TOPUP_MAX_USD must be valid decimal numbers');
    }

    const rawExpiry = env.TOPUP_INITIATED_EXPIRY_MINUTES;
    let expiryMinutes = 30;
    if (rawExpiry) {
      const parsed = parseInt(rawExpiry, 10);
      if (!isNaN(parsed) && parsed > 0) {
        expiryMinutes = parsed;
      }
    }

    return new TopUpLimits(minUsd, maxUsd, expiryMinutes);
  }

  public validateAmount(rawAmount: string | Decimal | UsdAmount): ValidateTopUpAmountResult {
    let usd: UsdAmount;
    try {
      if (rawAmount instanceof UsdAmount) {
        usd = rawAmount;
      } else if (typeof rawAmount === 'string') {
        const trimmed = rawAmount.trim().replace(/^\$/, '');
        if (!trimmed) {
          return {
            valid: false,
            error: 'INVALID_FORMAT',
            message: 'فرمت مبلغ نامعتبر است. لطفاً یک عدد معتبر وارد کنید (مانند 50 یا 50.00).',
          };
        }
        usd = new UsdAmount(trimmed);
      } else {
        usd = new UsdAmount(rawAmount);
      }
    } catch {
      return {
        valid: false,
        error: 'INVALID_FORMAT',
        message: 'فرمت مبلغ نامعتبر است. لطفاً یک عدد معتبر وارد کنید (مانند 50 یا 50.00).',
      };
    }

    if (!usd.isPositive()) {
      return {
        valid: false,
        error: 'BELOW_MIN',
        message: `حداقل مبلغ افزایش موجودی ${this.minUsd.format()} است.`,
      };
    }

    if (usd.lt(this.minUsd)) {
      return {
        valid: false,
        error: 'BELOW_MIN',
        message: `حداقل مبلغ افزایش موجودی ${this.minUsd.format()} است.`,
      };
    }

    if (usd.gt(this.maxUsd)) {
      return {
        valid: false,
        error: 'ABOVE_MAX',
        message: `حداکثر مبلغ افزایش موجودی ${this.maxUsd.format()} است.`,
      };
    }

    return {
      valid: true,
      amount: usd,
      amountDecimal: usd.toDecimal(),
      amountString: usd.toFixed(2),
    };
  }

  public calculateExpiryDate(fromNow: Date = new Date()): Date {
    return new Date(fromNow.getTime() + this.expiryMinutes * 60 * 1000);
  }
}
