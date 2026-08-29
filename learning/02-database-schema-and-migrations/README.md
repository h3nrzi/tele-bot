# 📖 Lesson 02: Relational Database Schema & Drizzle Migrations

In this lesson, you will design and implement the PostgreSQL database layer using **Drizzle ORM**, defining relational schemas, partial unique indices, foreign key constraints, and a programmatic migration runner.

---

## 🎯 Learning Objectives
1. Configure **Drizzle ORM** with PostgreSQL (`pg` pool client).
2. Model 7 domain tables: `users`, `wallets`, `exchange_rates`, `bank_accounts`, `top_up_requests`, `ledger_transactions`, and `ledger_entries`.
3. Implement PostgreSQL Enums and **Partial Unique Indices** to enforce domain invariants directly at the database engine level (e.g. only one active top-up per buyer).
4. Establish type-safe relations between entities.
5. Create a robust migration script using `drizzle-orm/node-postgres/migrator`.

---

## 🏛️ Database Architecture Diagram

```
+-------------------+           +-----------------------+
|       users       | 1       1 |        wallets        |
|-------------------|-----------|-----------------------|
| id (UUID, PK)     |           | id (UUID, PK)         |
| telegram_chat_id  |           | user_id (UUID, FK, UQ)|
| telegram_username |           | available_balance     |
| created_at        |           | updated_at            |
+-------------------+           +-----------------------+
          | 1                               | 1
          |                                 |
          | *                               | * (nullable)
+-----------------------+       +-----------------------+
|    top_up_requests    | 1   * |    ledger_entries     |
|-----------------------|-------|-----------------------|
| id (UUID, PK)         |       | id (UUID, PK)         |
| user_id (FK)          |       | ledger_transaction_id |
| exchange_rate_id (FK) |       | account_type (ENUM)   |
| usd_amount            |       | direction (ENUM)      |
| irr_amount            |       | usd_amount (NUMERIC)  |
| status (ENUM)         |       | wallet_id (UUID, FK)  |
| receipt_file_id       |       | created_at            |
| expires_at            |       +-----------------------+
+-----------------------+                   | *
          | 1                               |
          |                                 | 1
          | 1                   +-----------------------+
          +---------------------|  ledger_transactions  |
                                |-----------------------|
                                | id (UUID, PK)         |
                                | top_up_request_id(FK) |
                                | narrative (TEXT)      |
                                | created_at            |
                                +-----------------------+
```

---

## 🛠️ Step-by-Step Implementation

### Step 1: Drizzle Configuration (`drizzle.config.ts`)

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/core/database/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/tele_bot',
  },
});
```

---

### Step 2: Buyer & Wallet Schemas

#### Buyer Schema (`src/modules/buyer/buyer.schema.ts`):
```typescript
import { pgTable, uuid, bigint, varchar, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { wallets } from '@/modules/wallet/wallet.schema';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  telegramChatId: bigint('telegram_chat_id', { mode: 'bigint' }).notNull().unique(),
  telegramUsername: varchar('telegram_username', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
});

export const usersRelations = relations(users, ({ one }) => ({
  wallet: one(wallets, {
    fields: [users.id],
    references: [wallets.userId],
  }),
}));

export type BuyerSchema = typeof users.$inferSelect;
export type NewBuyerSchema = typeof users.$inferInsert;
```

#### Wallet Schema (`src/modules/wallet/wallet.schema.ts`):
```typescript
import { pgTable, uuid, numeric, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from '@/modules/buyer/buyer.schema';

export const wallets = pgTable('wallets', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id),
  availableBalance: numeric('available_balance', { precision: 18, scale: 2 })
    .notNull()
    .default('0.00'),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
});

export const walletsRelations = relations(wallets, ({ one }) => ({
  user: one(users, {
    fields: [wallets.userId],
    references: [users.id],
  }),
}));

export type WalletSchema = typeof wallets.$inferSelect;
export type NewWalletSchema = typeof wallets.$inferInsert;
```

---

### Step 3: Exchange Rates & Bank Accounts

#### Exchange Rates (`src/modules/exchange-rate/exchange-rate.schema.ts`):
```typescript
import { pgTable, uuid, bigint, timestamp } from 'drizzle-orm/pg-core';

export const exchangeRates = pgTable('exchange_rates', {
  id: uuid('id').defaultRandom().primaryKey(),
  irrPerUsd: bigint('irr_per_usd', { mode: 'bigint' }).notNull(),
  createdByAdminTelegramId: bigint('created_by_admin_telegram_id', { mode: 'bigint' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
});

export type ExchangeRateSchema = typeof exchangeRates.$inferSelect;
export type NewExchangeRateSchema = typeof exchangeRates.$inferInsert;
```

#### Bank Accounts (`src/modules/bank-account/bank-account.schema.ts`):
```typescript
import { pgTable, uuid, varchar, text, boolean, timestamp } from 'drizzle-orm/pg-core';

export const bankAccounts = pgTable('bank_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  cardNumber: varchar('card_number', { length: 16 }).notNull(),
  cardHolderName: varchar('card_holder_name').notNull(),
  bankName: varchar('bank_name').notNull(),
  additionalNotes: text('additional_notes'),
  isActive: boolean('is_active').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
});

export type BankAccountSchema = typeof bankAccounts.$inferSelect;
export type NewBankAccountSchema = typeof bankAccounts.$inferInsert;
```

---

### Step 4: Top-Up Requests & Partial Unique Index (`src/modules/top-up/top-up.schema.ts`)

Notice the partial unique index `top_up_requests_user_id_active_idx`. It prevents race conditions from creating multiple active requests for the same buyer:

```typescript
import {
  pgTable,
  uuid,
  bigint,
  numeric,
  varchar,
  text,
  timestamp,
  pgEnum,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from '@/modules/buyer/buyer.schema';
import { exchangeRates } from '@/modules/exchange-rate/exchange-rate.schema';

export const topUpStatusEnum = pgEnum('top_up_status', [
  'INITIATED',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
]);

export const topUpRequests = pgTable(
  'top_up_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    exchangeRateId: uuid('exchange_rate_id')
      .notNull()
      .references(() => exchangeRates.id),
    usdAmount: numeric('usd_amount', { precision: 18, scale: 2 }).notNull(),
    irrAmount: bigint('irr_amount', { mode: 'bigint' }).notNull(),
    status: topUpStatusEnum('status').notNull(),
    receiptFileId: varchar('receipt_file_id'),
    receiptCaption: text('receipt_caption'),
    rejectionReason: text('rejection_reason'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    processedByAdminTelegramId: bigint('processed_by_admin_telegram_id', { mode: 'bigint' }),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('top_up_requests_user_id_active_idx')
      .on(table.userId)
      .where(sql`${table.status} IN ('INITIATED', 'PENDING')`),
  ]
);

export const topUpRequestsRelations = relations(topUpRequests, ({ one }) => ({
  user: one(users, {
    fields: [topUpRequests.userId],
    references: [users.id],
  }),
  exchangeRate: one(exchangeRates, {
    fields: [topUpRequests.exchangeRateId],
    references: [exchangeRates.id],
  }),
}));

export type TopUpRequestSchema = typeof topUpRequests.$inferSelect;
export type NewTopUpRequestSchema = typeof topUpRequests.$inferInsert;
```

---

### Step 5: Double-Entry Ledger Schema (`src/modules/ledger/ledger.schema.ts`)

```typescript
import { pgTable, uuid, numeric, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { topUpRequests } from '@/modules/top-up/top-up.schema';
import { wallets } from '@/modules/wallet/wallet.schema';

export const ledgerAccountTypeEnum = pgEnum('ledger_account_type', [
  'BUYER_WALLET',
  'SYSTEM_CASH',
]);

export const ledgerEntryDirectionEnum = pgEnum('ledger_entry_direction', [
  'DEBIT',
  'CREDIT',
]);

export const ledgerTransactions = pgTable('ledger_transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  topUpRequestId: uuid('top_up_request_id').references(() => topUpRequests.id),
  narrative: text('narrative').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
});

export const ledgerEntries = pgTable('ledger_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  ledgerTransactionId: uuid('ledger_transaction_id')
    .notNull()
    .references(() => ledgerTransactions.id),
  accountType: ledgerAccountTypeEnum('account_type').notNull(),
  direction: ledgerEntryDirectionEnum('direction').notNull(),
  usdAmount: numeric('usd_amount', { precision: 18, scale: 2 }).notNull(),
  walletId: uuid('wallet_id').references(() => wallets.id),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
});

export const ledgerTransactionsRelations = relations(
  ledgerTransactions,
  ({ one, many }) => ({
    topUpRequest: one(topUpRequests, {
      fields: [ledgerTransactions.topUpRequestId],
      references: [topUpRequests.id],
    }),
    entries: many(ledgerEntries),
  })
);

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
  transaction: one(ledgerTransactions, {
    fields: [ledgerEntries.ledgerTransactionId],
    references: [ledgerTransactions.id],
  }),
  wallet: one(wallets, {
    fields: [ledgerEntries.walletId],
    references: [wallets.id],
  }),
}));
```

---

### Step 6: Schema Aggregator & Database Client

#### Aggregator (`src/core/database/schema.ts`):
```typescript
export * from '@/modules/buyer/buyer.schema';
export * from '@/modules/wallet/wallet.schema';
export * from '@/modules/exchange-rate/exchange-rate.schema';
export * from '@/modules/bank-account/bank-account.schema';
export * from '@/modules/top-up/top-up.schema';
export * from '@/modules/ledger/ledger.schema';
```

#### Client & Connection Pool (`src/core/database/client.ts`):
```typescript
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '@/core/database/schema';

const { Pool } = pg;

export type DbClient = NodePgDatabase<typeof schema>;

export interface DatabaseConnection {
  pool: pg.Pool;
  db: DbClient;
}

let defaultConnection: DatabaseConnection | null = null;

export function createDatabaseConnection(connectionString?: string): DatabaseConnection {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required to initialize database connection.');
  }

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });

  return { pool, db };
}

export function getDefaultDb(): DbClient {
  if (!defaultConnection) {
    defaultConnection = createDatabaseConnection();
  }
  return defaultConnection.db;
}
```

---

## 🧪 Verification & Testing

Generate and run migrations, then test schema invariants:
```bash
npx vitest run tests/core/database/migrations.test.ts
```

Expected output:
```
✓ tests/core/database/migrations.test.ts (13 tests)
```

---

## 🚀 Next Step
Proceed to [**Lesson 03: Dependency Injection Architecture with TSyringe**](file:///Users/hossein/Projects/tele-bot/learning/03-dependency-injection-and-tokens/README.md).
