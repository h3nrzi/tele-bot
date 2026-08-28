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

export type BankAccountRow = BankAccountSchema;
export type NewBankAccountRow = NewBankAccountSchema;
