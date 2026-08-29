# 📖 Lesson 03: Dependency Injection Architecture with TSyringe

In this lesson, you will build the Inversion of Control (IoC) and Dependency Injection (DI) system using **TSyringe**, establishing injection tokens, repository interfaces, and container lifecycle management.

---

## 🎯 Learning Objectives
1. Understand the **Dependency Inversion Principle (DIP)** and why high-level business services must depend on abstractions (interfaces/tokens) rather than concrete database instances.
2. Configure **TSyringe** with TypeScript decorators (`@injectable()`, `@inject()`) and `reflect-metadata`.
3. Create type-safe **Injection Tokens** (`TOKENS`) to bind interfaces to concrete implementations.
4. Implement the **`DbExecutor`** pattern to seamlessly execute queries either directly on the root pool or inside atomic database transactions (`client.transaction(...)`).
5. Build an isolated **Container Factory** (`createAppContainer`) supporting hierarchical child containers for unit/integration tests.

---

## 💡 Architecture & Design Pattern

```
                       +------------------------+
                       |    TSyringe Container  |
                       +-----------+------------+
                                   |
         +-------------------------+-------------------------+
         |                         |                         |
         v                         v                         v
+------------------+     +--------------------+    +--------------------+
| TOKENS.DbClient  |     | TOKENS.BuyerRepo   |    | TOKENS.TopUpRepo   |
| (Drizzle Client) |     | (IBuyerRepository) |    | (ITopUpRepo...)    |
+------------------+     +--------------------+    +--------------------+
         |                         ^                         ^
         | binds                   | injects                 | injects
         v                         |                         |
+------------------+     +--------------------+    +--------------------+
|  Postgres Pool   |     |    BuyerService    |    |    TopUpService    |
+------------------+     +--------------------+    +--------------------+
```

---

## 🛠️ Step-by-Step Implementation

### Step 1: Injection Tokens (`src/core/di/tokens.ts`)

Define canonical token identifiers for all services, repositories, and configuration objects:

```typescript
export const TOKENS = {
  // Infrastructure
  DbClient: Symbol('DbClient'),
  DatabaseConnection: Symbol('DatabaseConnection'),

  // Repositories
  BuyerRepository: Symbol('BuyerRepository'),
  WalletRepository: Symbol('WalletRepository'),
  ExchangeRateRepository: Symbol('ExchangeRateRepository'),
  BankAccountRepository: Symbol('BankAccountRepository'),
  TopUpRepository: Symbol('TopUpRepository'),
  LedgerRepository: Symbol('LedgerRepository'),

  // Domain Services
  BuyerService: Symbol('BuyerService'),
  WalletService: Symbol('WalletService'),
  ExchangeRateService: Symbol('ExchangeRateService'),
  BankAccountService: Symbol('BankAccountService'),
  TopUpService: Symbol('TopUpService'),
  LedgerService: Symbol('LedgerService'),

  // Value Objects & Config
  TopUpLimits: Symbol('TopUpLimits'),
} as const;
```

---

### Step 2: Database Executor Types (`src/core/database/types.ts`)

In Drizzle ORM, a transaction `tx` has the same querying capabilities as the root `db` client, but represents an isolated PostgreSQL transaction. We define `DbExecutor` to support both:

```typescript
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/core/database/schema';

export type DbClient = NodePgDatabase<typeof schema>;
export type DbTransaction = Parameters<Parameters<DbClient['transaction']>[0]>[0];

/**
 * Union type representing either a root Drizzle client or an in-flight transaction runner.
 */
export type DbExecutor = DbClient | DbTransaction;
```

---

### Step 3: Container Factory & Module Registration (`src/core/di/container.ts`)

```typescript
import 'reflect-metadata';
import { container, DependencyContainer } from 'tsyringe';
import { TOKENS } from '@/core/di/tokens';
import { getDefaultDb, type DatabaseConnection, type DbClient } from '@/core/database/client';
import { TopUpLimits } from '@/modules/top-up/top-up.limits.vo';

// Concrete Repositories
import { DrizzleBuyerRepository } from '@/modules/buyer/buyer.repository';
import { DrizzleWalletRepository } from '@/modules/wallet/wallet.repository';
import { DrizzleExchangeRateRepository } from '@/modules/exchange-rate/exchange-rate.repository';
import { DrizzleBankAccountRepository } from '@/modules/bank-account/bank-account.repository';
import { DrizzleTopUpRequestRepository } from '@/modules/top-up/top-up.repository';
import { DrizzleLedgerRepository } from '@/modules/ledger/ledger.repository';

// Services
import { BuyerService } from '@/modules/buyer/buyer.service';
import { WalletService } from '@/modules/wallet/wallet.service';
import { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import { BankAccountService } from '@/modules/bank-account/bank-account.service';
import { TopUpService } from '@/modules/top-up/top-up.service';
import { LedgerService } from '@/modules/ledger/ledger.service';

export interface CreateAppContainerOptions {
  databaseConnection?: DatabaseConnection;
  dbClient?: DbClient;
  topUpLimits?: TopUpLimits;
  child?: boolean;
}

export function createAppContainer(options?: CreateAppContainerOptions): DependencyContainer {
  const target = options?.child ? container.createChildContainer() : container;

  // 1. Bind Database Client
  const dbClient = options?.dbClient ?? options?.databaseConnection?.db ?? getDefaultDb();
  target.registerInstance(TOKENS.DbClient, dbClient);

  if (options?.databaseConnection) {
    target.registerInstance(TOKENS.DatabaseConnection, options.databaseConnection);
  }

  // 2. Bind Repositories
  target.registerSingleton(TOKENS.BuyerRepository, DrizzleBuyerRepository);
  target.registerSingleton(TOKENS.WalletRepository, DrizzleWalletRepository);
  target.registerSingleton(TOKENS.ExchangeRateRepository, DrizzleExchangeRateRepository);
  target.registerSingleton(TOKENS.BankAccountRepository, DrizzleBankAccountRepository);
  target.registerSingleton(TOKENS.TopUpRepository, DrizzleTopUpRequestRepository);
  target.registerSingleton(TOKENS.LedgerRepository, DrizzleLedgerRepository);

  // 3. Bind Domain Services
  target.registerSingleton(TOKENS.BuyerService, BuyerService);
  target.registerSingleton(TOKENS.WalletService, WalletService);
  target.registerSingleton(TOKENS.ExchangeRateService, ExchangeRateService);
  target.registerSingleton(TOKENS.BankAccountService, BankAccountService);
  target.registerSingleton(TOKENS.TopUpService, TopUpService);
  target.registerSingleton(TOKENS.LedgerService, LedgerService);

  // 4. Bind Configuration / Value Objects
  if (options?.topUpLimits) {
    target.registerInstance(TOKENS.TopUpLimits, options.topUpLimits);
  }

  return target;
}
```

---

## 🧪 Verification & Testing

Create `tests/core/di/container.test.ts` to test that all tokens and services resolve cleanly:

```typescript
import { describe, it, expect } from 'vitest';
import { createAppContainer } from '@/core/di/container';
import { TOKENS } from '@/core/di/tokens';
import { TopUpService } from '@/modules/top-up/top-up.service';

describe('Dependency Injection Container', () => {
  it('resolves all domain services and repositories correctly from child container', () => {
    const testContainer = createAppContainer({ child: true });

    const topUpService = testContainer.resolve<TopUpService>(TOKENS.TopUpService);
    expect(topUpService).toBeInstanceOf(TopUpService);
  });
});
```

Run the container test:
```bash
npx vitest run tests/core/di/container.test.ts
```

Expected output:
```
✓ tests/core/di/container.test.ts (1 test)
```

---

## 🚀 Next Step
Proceed to [**Lesson 04: Financial Core — Double-Entry Ledger & Materialized Wallet Balance**](file:///Users/hossein/Projects/tele-bot/learning/04-double-entry-ledger-and-wallet/README.md).
