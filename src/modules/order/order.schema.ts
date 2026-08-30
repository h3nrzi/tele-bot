import {
  pgTable,
  uuid,
  bigint,
  numeric,
  varchar,
  text,
  timestamp,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from '@/modules/buyer/buyer.schema';
import { catalogItems } from '@/modules/catalog/catalog.schema';
import { ledgerTransactions } from '@/modules/ledger/ledger.schema';

export const orderStatusEnum = pgEnum('order_status', [
  'PLACED',
  'PROCESSING',
  'FULFILLED',
  'REJECTED',
  'CANCELLED',
]);

export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  catalogItemId: uuid('catalog_item_id')
    .notNull()
    .references(() => catalogItems.id),
  usdPriceSnapshot: numeric('usd_price_snapshot', { precision: 18, scale: 2 }).notNull(),
  status: orderStatusEnum('status').notNull(),
  deliveryContent: text('delivery_content'),
  rejectionCategory: varchar('rejection_category', { length: 100 }),
  rejectionNote: text('rejection_note'),
  claimedByAdminTelegramId: bigint('claimed_by_admin_telegram_id', { mode: 'bigint' }),
  claimedAt: timestamp('claimed_at', { withTimezone: true, mode: 'date' }),
  fulfilledAt: timestamp('fulfilled_at', { withTimezone: true, mode: 'date' }),
  rejectedAt: timestamp('rejected_at', { withTimezone: true, mode: 'date' }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
});

export const orderAdminNotifications = pgTable('order_admin_notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id),
  adminTelegramId: bigint('admin_telegram_id', { mode: 'bigint' }).notNull(),
  chatId: bigint('chat_id', { mode: 'bigint' }).notNull(),
  messageId: bigint('message_id', { mode: 'bigint' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
});

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  catalogItem: one(catalogItems, {
    fields: [orders.catalogItemId],
    references: [catalogItems.id],
  }),
  adminNotifications: many(orderAdminNotifications),
  ledgerTransactions: many(ledgerTransactions),
}));

export const orderAdminNotificationsRelations = relations(
  orderAdminNotifications,
  ({ one }) => ({
    order: one(orders, {
      fields: [orderAdminNotifications.orderId],
      references: [orders.id],
    }),
  })
);

export type OrderSchema = typeof orders.$inferSelect;
export type NewOrderSchema = typeof orders.$inferInsert;
export type OrderRow = OrderSchema;
export type NewOrderRow = NewOrderSchema;

export type OrderAdminNotificationSchema = typeof orderAdminNotifications.$inferSelect;
export type NewOrderAdminNotificationSchema = typeof orderAdminNotifications.$inferInsert;
export type OrderAdminNotificationRow = OrderAdminNotificationSchema;
export type NewOrderAdminNotificationRow = NewOrderAdminNotificationSchema;
