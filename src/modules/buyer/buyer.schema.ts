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

export type BuyerRecord = BuyerSchema;
export type NewBuyerRecord = NewBuyerSchema;
export type User = BuyerSchema;
export type NewUser = NewBuyerSchema;
