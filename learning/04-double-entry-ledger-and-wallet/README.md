# 📖 Lesson 04: Financial Core — Double-Entry Ledger & Materialized Wallet Balance

In this lesson, you will build the financial engine of the bot: an **append-only double-entry ledger** balanced by a `SYSTEM_CASH` contra account ([`ADR-0001`](file:///Users/hossein/Projects/tele-bot/docs/adr/0001-append-only-double-entry-ledger-with-system-cash.md)), paired with a **materialized available wallet balance** protected by pessimistic row locking ([`ADR-0002`](file:///Users/hossein/Projects/tele-bot/docs/adr/0002-materialized-wallet-balance-with-pessimistic-locking.md)).

---

## 🎯 Learning Objectives
1. Understand **Double-Entry Bookkeeping** and why financial balances must never be modified without an immutable, auditable journal entry.
2. Implement the virtual **`SYSTEM_CASH` contra account** to balance top-up funding transactions.
3. Understand the trade-off between *calculated balances* (running `SUM(entries)` on every read) vs *materialized balances* with row-level locks (`SELECT FOR UPDATE`).
4. Implement `LedgerService`, `WalletService`, and their respective Drizzle repositories.
5. Prevent concurrent race conditions and double-credit anomalies under high load.

---

## 💡 Accounting Fundamentals & Invariants

### 1. The Double-Entry Invariant (ADR-0001)
For every financial movement, a `LedgerTransaction` is created containing exactly two `LedgerEntry` records:
- **Debit Entry**: Increases assets or contra accounts.
- **Credit Entry**: Increases liabilities or buyer wallet balances.

$$\sum \text{Debit Amounts} = \sum \text{Credit Amounts}$$

When Top-Up Request `#123` for **$50.00** is approved:
1. `DEBIT SYSTEM_CASH` = **$50.00**
2. `CREDIT BUYER_WALLET` (Wallet `abc-456`) = **$50.00**
3. Net transaction sum = **$0.00** (Perfect balance).

```
                      +-----------------------------+
                      |   Top-Up Request Approved   |
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+
                      |  LedgerTransaction (#tx-1)  |
                      +--------------+--------------+
                                     |
             +-----------------------+-----------------------+
             |                                               |
             v                                               v
+---------------------------+                   +---------------------------+
|    LedgerEntry (Debit)    |                   |   LedgerEntry (Credit)    |
| Account: SYSTEM_CASH      |                   | Account: BUYER_WALLET     |
| Direction: DEBIT          |                   | Direction: CREDIT         |
| Amount: $50.00            |                   | Amount: $50.00            |
+---------------------------+                   +-------------+-------------+
                                                              |
                                                              v updates column
                                                +---------------------------+
                                                |     Buyer Wallet Row      |
                                                | Available Balance: +$50.00|
                                                +---------------------------+
```

### 2. Pessimistic Locking with `FOR UPDATE` (ADR-0002)
To guarantee that two simultaneous requests cannot overwrite each other's balance calculations:
```sql
SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE;
```
This acquires an exclusive row-level lock on the buyer's wallet until the enclosing database transaction commits.

---

## 🛠️ Step-by-Step Implementation

### Step 1: Wallet Entity (`src/modules/wallet/wallet.entity.ts`)

```typescript
import { UsdAmount } from '@/core/shared/money.vo';

export interface WalletProps {
  id: string;
  userId: string;
  availableBalance: string | UsdAmount;
  updatedAt: Date;
}

export class Wallet {
  public readonly id: string;
  public readonly userId: string;
  public readonly availableBalance: UsdAmount;
  public readonly updatedAt: Date;

  constructor(props: WalletProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.availableBalance =
      props.availableBalance instanceof UsdAmount
        ? props.availableBalance
        : UsdAmount.from(props.availableBalance);
    this.updatedAt = props.updatedAt;
  }

  public credit(amount: UsdAmount | string): UsdAmount {
    const creditAmount = amount instanceof UsdAmount ? amount : UsdAmount.from(amount);
    return this.availableBalance.plus(creditAmount);
  }

  public debit(amount: UsdAmount | string): UsdAmount {
    const debitAmount = amount instanceof UsdAmount ? amount : UsdAmount.from(amount);
    if (this.availableBalance.lt(debitAmount)) {
      throw new Error('Insufficient wallet balance');
    }
    return this.availableBalance.minus(debitAmount);
  }
}
```

---

### Step 2: Ledger Repository (`src/modules/ledger/ledger.repository.ts`)

```typescript
import { injectable, inject } from 'tsyringe';
import { ledgerTransactions, ledgerEntries } from '@/modules/ledger/ledger.schema';
import { getDefaultDb, type DbClient } from '@/core/database/client';
import type { DbExecutor } from '@/core/database/types';
import type {
  ILedgerRepository,
  CreateLedgerTransactionInput,
  CreateLedgerTransactionResult,
} from '@/modules/ledger/ledger.repository.interface';
import { UsdAmount } from '@/core/shared/money.vo';
import { TOKENS } from '@/core/di/tokens';

@injectable()
export class DrizzleLedgerRepository implements ILedgerRepository<DbExecutor> {
  constructor(
    @inject(TOKENS.DbClient) private readonly defaultDb?: DbClient
  ) {}

  private getDb(executor?: DbExecutor): DbExecutor {
    return executor ?? this.defaultDb ?? getDefaultDb();
  }

  public async createTransactionWithEntries(
    input: CreateLedgerTransactionInput,
    executor?: DbExecutor
  ): Promise<CreateLedgerTransactionResult> {
    const db = this.getDb(executor);

    // 1. Insert Transaction Header
    const [txRow] = await db
      .insert(ledgerTransactions)
      .values({
        topUpRequestId: input.topUpRequestId,
        narrative: input.narrative,
      })
      .returning();

    if (!txRow) {
      throw new Error('Failed to create ledger transaction header');
    }

    // 2. Insert Entries
    const entryValues = input.entries.map((entry) => ({
      ledgerTransactionId: txRow.id,
      accountType: entry.accountType,
      direction: entry.direction,
      usdAmount:
        entry.usdAmount instanceof UsdAmount
          ? entry.usdAmount.toFixed(2)
          : entry.usdAmount,
      walletId: entry.walletId ?? null,
    }));

    const insertedEntries = await db
      .insert(ledgerEntries)
      .values(entryValues)
      .returning();

    return {
      transaction: txRow,
      entries: insertedEntries,
    };
  }
}
```

---

### Step 3: Ledger Service (`src/modules/ledger/ledger.service.ts`)

```typescript
import { injectable, inject } from 'tsyringe';
import type { DbExecutor } from '@/core/database/types';
import type {
  ILedgerRepository,
  CreateLedgerTransactionResult,
} from '@/modules/ledger/ledger.repository.interface';
import { TOKENS } from '@/core/di/tokens';
import { UsdAmount } from '@/core/shared/money.vo';

export interface RecordTopUpCreditParams {
  topUpRequestId: string;
  walletId: string;
  usdAmount: UsdAmount | string;
}

@injectable()
export class LedgerService {
  constructor(
    @inject(TOKENS.LedgerRepository)
    private readonly ledgerRepo: ILedgerRepository<DbExecutor>
  ) {}

  /**
   * Records a double-entry ledger transaction crediting a buyer wallet upon top-up approval:
   * - DEBIT SYSTEM_CASH
   * - CREDIT BUYER_WALLET
   */
  public async recordTopUpCredit(
    params: RecordTopUpCreditParams,
    executor: DbExecutor
  ): Promise<CreateLedgerTransactionResult> {
    return await this.ledgerRepo.createTransactionWithEntries(
      {
        topUpRequestId: params.topUpRequestId,
        narrative: `Top-up approval for request ${params.topUpRequestId}`,
        entries: [
          {
            accountType: 'SYSTEM_CASH',
            direction: 'DEBIT',
            usdAmount: params.usdAmount,
            walletId: null,
          },
          {
            accountType: 'BUYER_WALLET',
            direction: 'CREDIT',
            usdAmount: params.usdAmount,
            walletId: params.walletId,
          },
        ],
      },
      executor
    );
  }
}
```

---

### Step 4: Wallet Repository & Service

#### Wallet Repository (`src/modules/wallet/wallet.repository.ts`):
```typescript
import { injectable, inject } from 'tsyringe';
import { eq } from 'drizzle-orm';
import { wallets } from '@/modules/wallet/wallet.schema';
import { getDefaultDb, type DbClient } from '@/core/database/client';
import type { DbExecutor } from '@/core/database/types';
import { Wallet } from '@/modules/wallet/wallet.entity';
import type { IWalletRepository } from '@/modules/wallet/wallet.repository.interface';
import { UsdAmount } from '@/core/shared/money.vo';
import { TOKENS } from '@/core/di/tokens';

@injectable()
export class DrizzleWalletRepository implements IWalletRepository<DbExecutor> {
  constructor(
    @inject(TOKENS.DbClient) private readonly defaultDb?: DbClient
  ) {}

  private getDb(executor?: DbExecutor): DbExecutor {
    return executor ?? this.defaultDb ?? getDefaultDb();
  }

  public async findByUserIdForUpdate(
    userId: string,
    executor: DbExecutor
  ): Promise<Wallet | null> {
    const [row] = await executor
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .for('update');

    if (!row) return null;
    return new Wallet(row);
  }

  public async updateBalance(
    walletId: string,
    newBalance: UsdAmount | string,
    executor?: DbExecutor
  ): Promise<Wallet> {
    const db = this.getDb(executor);
    const balanceStr = newBalance instanceof UsdAmount ? newBalance.toString() : newBalance;

    const [row] = await db
      .update(wallets)
      .set({
        availableBalance: balanceStr,
        updatedAt: new Date(),
      })
      .where(eq(wallets.id, walletId))
      .returning();

    if (!row) throw new Error('Failed to update wallet balance');
    return new Wallet(row);
  }
}
```

---

## 🧪 Verification & Testing

Run ledger and wallet test suites:
```bash
npx vitest run tests/modules/ledger/ tests/modules/wallet/
```

Expected output:
```
✓ tests/modules/ledger/ledger-transaction.entity.test.ts (3 tests)
✓ tests/modules/ledger/ledger.service.test.ts (1 test)
✓ tests/modules/wallet/wallet.entity.test.ts (4 tests)
✓ tests/modules/wallet/wallet.service.test.ts (4 tests)
```

---

## 🚀 Next Step
Proceed to [**Lesson 05: Supporting Modules — Exchange Rates, Bank Accounts & Buyer Registration**](file:///Users/hossein/Projects/tele-bot/learning/05-exchange-rate-and-bank-account/README.md).
