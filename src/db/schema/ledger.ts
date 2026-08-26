import { pgTable, uuid, numeric, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { topUpRequests } from './top-up-requests';
import { wallets } from './wallets';

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

export type LedgerTransaction = typeof ledgerTransactions.$inferSelect;
export type NewLedgerTransaction = typeof ledgerTransactions.$inferInsert;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type NewLedgerEntry = typeof ledgerEntries.$inferInsert;
export type LedgerAccountType = (typeof ledgerAccountTypeEnum.enumValues)[number];
export type LedgerEntryDirection = (typeof ledgerEntryDirectionEnum.enumValues)[number];
