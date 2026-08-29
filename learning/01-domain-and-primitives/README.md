# 📖 Lesson 01: Domain Modeling & Shared Primitives

In this lesson, you will build the foundational domain value objects, currency conversion math, domain errors, and Telegram identifier utilities.

---

## 🎯 Learning Objectives
1. Understand **Value Objects** in DDD and why financial software must **never use native JavaScript floating-point numbers (`number`) for money**.
2. Implement `UsdAmount` using `decimal.js` for arbitrary-precision decimal arithmetic ([`ADR-0004`](file:///Users/hossein/Projects/tele-bot/docs/adr/0004-decimal-js-for-usd-arithmetic.md)).
3. Implement `IrrAmount` using `BigInt` for Iranian Rial integer calculations.
4. Build currency formatters for USD, IRR, and Toman conversions.
5. Create a structured domain error hierarchy.
6. Create Telegram chat ID normalization utilities to handle 64-bit signed Telegram IDs safely.

---

## 💡 Concepts & Architecture Decisions

### Why Not `number` for Money? (ADR-0004)
JavaScript `number` uses IEEE-754 double-precision 64-bit binary floating point:
```ts
0.1 + 0.2 === 0.30000000000000004 // ❌ True in standard JS!
```
In a marketplace wallet with double-entry ledgers:
- Floating point inaccuracies cause rounding drift.
- Double-entry ledger entries ($\text{Debit} - \text{Credit}$) would fail zero-sum balance checks.
- Materialized wallet balances would accumulate phantom fractional cents.

**The Solution:**
- Store USD amounts in PostgreSQL as `numeric(18, 2)` and parse them into a domain `UsdAmount` value object wrapping `Decimal` (`decimal.js`).
- Store IRR amounts as PostgreSQL `bigint` and parse them into an `IrrAmount` value object wrapping native JavaScript `bigint`.

---

## 🛠️ Step-by-Step Implementation

### Step 1: USD Value Object (`src/core/shared/money.vo.ts`)

Create `UsdAmount` with immutable arithmetic and comparison methods:

```typescript
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
```

### Step 2: IRR Value Object (`src/core/shared/money.vo.ts`)

Append `IrrAmount` for exact integer Rials:

```typescript
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
```

---

### Step 3: Currency Utilities (`src/core/shared/currency.utils.ts`)

```typescript
import Decimal from 'decimal.js';

export function formatUsd(amount: Decimal | string | number): string {
  const d = amount instanceof Decimal ? amount : new Decimal(amount);
  return `$${d.toFixed(2)}`;
}

export function formatIrr(amount: bigint | number | string): string {
  const big = typeof amount === 'bigint' ? amount : BigInt(amount);
  return big.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function rialToToman(rialAmount: bigint | number | string): bigint {
  const rials = typeof rialAmount === 'bigint' ? rialAmount : BigInt(rialAmount);
  return rials / 10n;
}

export function formatToman(rialAmount: bigint | number | string): string {
  const toman = rialToToman(rialAmount);
  return `${formatIrr(toman)} Toman`;
}

export function usdToIrr(
  usd: Decimal | string | number,
  irrPerUsd: bigint | number | string
): bigint {
  const usdDec = usd instanceof Decimal ? usd : new Decimal(usd);
  const rateDec = new Decimal(irrPerUsd.toString());
  const totalIrr = usdDec.mul(rateDec).round();
  return BigInt(totalIrr.toFixed(0));
}
```

---

### Step 4: Domain Error Hierarchy (`src/core/shared/domain.error.ts`)

```typescript
export abstract class DomainError extends Error {
  public abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotFoundError extends DomainError {
  public readonly code = 'NOT_FOUND';
}

export class ConflictError extends DomainError {
  public readonly code = 'CONFLICT';
}

export class ValidationError extends DomainError {
  public readonly code = 'VALIDATION_ERROR';
}
```

---

### Step 5: Telegram Utilities (`src/core/shared/telegram.utils.ts`)

Telegram user IDs and chat IDs can exceed 32-bit integer limits:

```typescript
export function normalizeChatId(id: bigint | number | string): bigint {
  if (typeof id === 'bigint') {
    return id;
  }
  return BigInt(id);
}

export function chatIdToString(id: bigint | number | string): string {
  return normalizeChatId(id).toString();
}
```

---

## 🧪 Verification & Testing

Create test files in `tests/core/shared/money.vo.test.ts` and `tests/core/shared/currency.test.ts`.

Run tests:
```bash
npx vitest run tests/core/shared/
```

Expected output:
```
✓ tests/core/shared/money.vo.test.ts (4 tests)
✓ tests/core/shared/currency.test.ts (11 tests)
```

---

## 🚀 Next Step
Proceed to [**Lesson 02: Relational Database Schema & Drizzle Migrations**](file:///Users/hossein/Projects/tele-bot/learning/02-database-schema-and-migrations/README.md).
