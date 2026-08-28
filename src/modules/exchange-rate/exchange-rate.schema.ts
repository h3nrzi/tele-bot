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

export type ExchangeRateRow = ExchangeRateSchema;
export type NewExchangeRateRow = NewExchangeRateSchema;
