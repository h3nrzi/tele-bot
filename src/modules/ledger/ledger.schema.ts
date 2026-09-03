import {
  pgTable,
  uuid,
  numeric,
  text,
  timestamp,
  pgEnum,
  check,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { topUpRequests } from '@/modules/top-up/top-up.schema';
import { wallets } from '@/modules/wallet/wallet.schema';
import { orders } from '@/modules/order/order.schema';

export const ledgerAccountTypeEnum = pgEnum('ledger_account_type', [
  'BUYER_WALLET',
  'SYSTEM_CASH',
]);

export const ledgerEntryDirectionEnum = pgEnum('ledger_entry_direction', [
  'DEBIT',
  'CREDIT',
]);

export const ledgerTransactions = pgTable(
  'ledger_transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    topUpRequestId: uuid('top_up_request_id').references(() => topUpRequests.id),
    orderId: uuid('order_id').references(() => orders.id),
    reversedByLedgerTransactionId: uuid('reversed_by_ledger_transaction_id').references(
      (): AnyPgColumn => ledgerTransactions.id
    ),
    narrative: text('narrative').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      'ledger_transactions_source_xor_check',
      sql`(${table.topUpRequestId} IS NULL) != (${table.orderId} IS NULL)`
    ),
  ]
);

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
    order: one(orders, {
      fields: [ledgerTransactions.orderId],
      references: [orders.id],
    }),
    reversedBy: one(ledgerTransactions, {
      fields: [ledgerTransactions.reversedByLedgerTransactionId],
      references: [ledgerTransactions.id],
      relationName: 'ledger_transaction_reversals',
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

export type LedgerTransactionSchema = typeof ledgerTransactions.$inferSelect;
export type NewLedgerTransactionSchema = typeof ledgerTransactions.$inferInsert;
export type LedgerEntrySchema = typeof ledgerEntries.$inferSelect;
export type NewLedgerEntrySchema = typeof ledgerEntries.$inferInsert;

export type LedgerTransactionRow = LedgerTransactionSchema;
export type NewLedgerTransactionRow = NewLedgerTransactionSchema;
export type LedgerEntryRow = LedgerEntrySchema;
export type NewLedgerEntryRow = NewLedgerEntrySchema;
