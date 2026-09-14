import {
  pgTable,
  uuid,
  numeric,
  integer,
  bigint,
  timestamp,
  pgEnum,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const rateModeEnum = pgEnum('rate_mode', ['MANUAL', 'AUTO_SYNC']);

export const exchangeRateConfig = pgTable(
  'exchange_rate_config',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    mode: rateModeEnum('mode').default('MANUAL').notNull(),
    spreadPercent: numeric('spread_percent', { precision: 5, scale: 2 })
      .default('0.00')
      .notNull(),
    syncIntervalMinutes: integer('sync_interval_minutes').default(60).notNull(),
    updatedByAdminTelegramId: bigint('updated_by_admin_telegram_id', { mode: 'bigint' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      'exchange_rate_config_spread_check',
      sql`${table.spreadPercent} >= 0 AND ${table.spreadPercent} <= 10`
    ),
  ]
);

export type ExchangeRateConfigSchema = typeof exchangeRateConfig.$inferSelect;
export type NewExchangeRateConfigSchema = typeof exchangeRateConfig.$inferInsert;

export type ExchangeRateConfigRow = ExchangeRateConfigSchema;
export type NewExchangeRateConfigRow = NewExchangeRateConfigSchema;
