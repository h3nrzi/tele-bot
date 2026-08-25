import { pgTable, uuid, bigint, timestamp } from 'drizzle-orm/pg-core';

export const exchangeRates = pgTable('exchange_rates', {
  id: uuid('id').defaultRandom().primaryKey(),
  irrPerUsd: bigint('irr_per_usd', { mode: 'bigint' }).notNull(),
  createdByAdminTelegramId: bigint('created_by_admin_telegram_id', { mode: 'bigint' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
});

export type ExchangeRate = typeof exchangeRates.$inferSelect;
export type NewExchangeRate = typeof exchangeRates.$inferInsert;
