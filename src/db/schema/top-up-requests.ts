import { pgTable, uuid, bigint, numeric, varchar, text, timestamp, pgEnum, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from '@/db/schema/users';
import { exchangeRates } from '@/db/schema/exchange-rates';

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

export type TopUpRequest = typeof topUpRequests.$inferSelect;
export type NewTopUpRequest = typeof topUpRequests.$inferInsert;
export type TopUpStatus = (typeof topUpStatusEnum.enumValues)[number];
