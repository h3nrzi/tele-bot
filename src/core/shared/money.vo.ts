import Decimal from 'decimal.js';

/**
 * Value object representing an amount in USD ($) with exact 2 decimal places arithmetic.
 */
export class UsdAmount {
  private readonly value: Decimal;

  constructor(amount: Decimal | string | number) {
    if (amount instanceof Decimal) {
      this.value = amount;
    } else {
      this.value = new Decimal(amount);
    }

    if (this.value.isNaN()) {
      throw new Error(`Invalid USD amount: ${amount}`);
    }
  }

  public static zero(): UsdAmount {
    return new UsdAmount('0.00');
  }

  public static from(amount: Decimal | string | number): UsdAmount {
    return new UsdAmount(amount);
  }

  public toDecimal(): Decimal {
    return this.value;
  }

  public toFixed(fractionDigits = 2): string {
    return this.value.toFixed(fractionDigits);
  }

  public toString(): string {
    return this.value.toString();
  }

  public format(): string {
    return `$${this.toFixed(2)}`;
  }

  public plus(other: UsdAmount | Decimal | string): UsdAmount {
    const addend = other instanceof UsdAmount ? other.value : new Decimal(other);
    return new UsdAmount(this.value.plus(addend));
  }

  public minus(other: UsdAmount | Decimal | string): UsdAmount {
    const subtrahend = other instanceof UsdAmount ? other.value : new Decimal(other);
    return new UsdAmount(this.value.minus(subtrahend));
  }

  public isPositive(): boolean {
    return this.value.gt(0);
  }

  public isZero(): boolean {
    return this.value.isZero();
  }

  public lt(other: UsdAmount): boolean {
    return this.value.lt(other.value);
  }

  public lte(other: UsdAmount): boolean {
    return this.value.lte(other.value);
  }

  public gt(other: UsdAmount): boolean {
    return this.value.gt(other.value);
  }

  public gte(other: UsdAmount): boolean {
    return this.value.gte(other.value);
  }

  public equals(other: UsdAmount): boolean {
    return this.value.equals(other.value);
  }
}

/**
 * Value object representing an amount in Iranian Rials (IRR) as an integer.
 */
export class IrrAmount {
  private readonly value: bigint;

  constructor(amount: bigint | number | string | Decimal) {
    if (typeof amount === 'bigint') {
      this.value = amount;
    } else if (amount instanceof Decimal) {
      this.value = BigInt(amount.round().toFixed(0));
    } else if (typeof amount === 'number') {
      this.value = BigInt(Math.round(amount));
    } else {
      this.value = BigInt(new Decimal(amount).round().toFixed(0));
    }
  }

  public static from(amount: bigint | number | string | Decimal): IrrAmount {
    return new IrrAmount(amount);
  }

  public toBigInt(): bigint {
    return this.value;
  }

  public toString(): string {
    return this.value.toString();
  }

  public format(): string {
    const str = this.value.toString();
    return str.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
}
