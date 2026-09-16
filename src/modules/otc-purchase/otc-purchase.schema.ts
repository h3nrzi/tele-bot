import { pgTable, uuid, numeric, varchar, bigint, text, timestamp, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { topUpRequests } from "@/modules/top-up/top-up.schema";

export const otcPurchaseStatusEnum = pgEnum("otc_purchase_status", ["PENDING", "COMPLETED", "FAILED"]);

export const wallexOtcPurchases = pgTable(
	"wallex_otc_purchases",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		topUpRequestId: uuid("top_up_request_id")
			.notNull()
			.references(() => topUpRequests.id),
		usdtQuantity: numeric("usdt_quantity", {
			precision: 18,
			scale: 2,
		}).notNull(),
		status: otcPurchaseStatusEnum("status").notNull(),
		wallexClientOrderId: varchar("wallex_client_order_id", { length: 255 }),
		wallexExecutedPrice: bigint("wallex_executed_price", { mode: "bigint" }),
		wallexExecutedQty: numeric("wallex_executed_qty", {
			precision: 18,
			scale: 8,
		}),
		wallexExecutedSum: bigint("wallex_executed_sum", { mode: "bigint" }),
		wallexFee: bigint("wallex_fee", { mode: "bigint" }),
		errorMessage: text("error_message"),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("wallex_otc_purchases_top_up_request_id_active_idx")
			.on(table.topUpRequestId)
			.where(sql`${table.status} IN ('PENDING', 'COMPLETED')`),
	],
);

export const wallexOtcPurchasesRelations = relations(wallexOtcPurchases, ({ one }) => ({
	topUpRequest: one(topUpRequests, {
		fields: [wallexOtcPurchases.topUpRequestId],
		references: [topUpRequests.id],
	}),
}));

export type WallexOtcPurchaseSchema = typeof wallexOtcPurchases.$inferSelect;
export type NewWallexOtcPurchaseSchema = typeof wallexOtcPurchases.$inferInsert;

export type WallexOtcPurchaseRow = WallexOtcPurchaseSchema;
export type NewWallexOtcPurchaseRow = NewWallexOtcPurchaseSchema;
