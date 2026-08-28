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

export type WalletRow = WalletSchema;
export type NewWalletRow = NewWalletSchema;
