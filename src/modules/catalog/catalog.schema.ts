import { pgTable, uuid, varchar, text, numeric, boolean, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { orders } from '@/modules/order/order.schema';

export const catalogItems = pgTable('catalog_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  usdPrice: numeric('usd_price', { precision: 18, scale: 2 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
});

export const catalogItemsRelations = relations(catalogItems, ({ many }) => ({
  orders: many(orders),
}));

export type CatalogItemSchema = typeof catalogItems.$inferSelect;
export type NewCatalogItemSchema = typeof catalogItems.$inferInsert;

export type CatalogItemRow = CatalogItemSchema;
export type NewCatalogItemRow = NewCatalogItemSchema;
