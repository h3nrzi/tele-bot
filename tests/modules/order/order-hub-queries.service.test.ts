import { describe, it, expect } from "vitest";
import { setupTestDatabase } from "@tests/helpers/test-db";
import { createTestBuyer, createTestCatalogItem, placeTestOrder, claimTestOrder } from "@tests/helpers/fixtures";
import { OrderService } from "@/modules/order/order.service";
import { LedgerService } from "@/modules/ledger/ledger.service";
import { orders } from "@/modules/order/order.schema";
import { wallets } from "@/modules/wallet/wallet.schema";
import { topUpRequests } from "@/modules/top-up/top-up.schema";
import { eq } from "drizzle-orm";

describe("Account Hub Service Queries (Ticket 01)", () => {
	const { db, container } = setupTestDatabase();

	describe("OrderService.getRecentOrdersForBuyer", () => {
		it("returns empty array when buyer has no orders", async () => {
			const { buyer } = await createTestBuyer(container, {
				telegramChatId: 20001,
				telegramUsername: "buyer_empty_orders",
			});

			const orderService = container.resolve(OrderService);
			const recentOrders = await orderService.getRecentOrdersForBuyer(buyer.telegramChatId);

			expect(recentOrders).toEqual([]);
		});

		it("returns orders in descending date order, each carrying the catalog item name", async () => {
			const { buyer, wallet } = await createTestBuyer(container, {
				telegramChatId: 20002,
				telegramUsername: "buyer_multi_orders",
			});

			await db.update(wallets).set({ availableBalance: "1000.00" }).where(eq(wallets.id, wallet.id));

			const itemA = await createTestCatalogItem(container, {
				name: "Service A",
				usdPrice: "10.00",
				isActive: true,
			});

			const itemB = await createTestCatalogItem(container, {
				name: "Service B",
				usdPrice: "20.00",
				isActive: true,
			});

			const { order: order1 } = await placeTestOrder(container, {
				userId: buyer.id,
				catalogItemId: itemA.id,
			});

			const { order: order2 } = await placeTestOrder(container, {
				userId: buyer.id,
				catalogItemId: itemB.id,
			});

			// Update order1 to older date to guarantee descending sort order
			await db
				.update(orders)
				.set({ createdAt: new Date(Date.now() - 10000) })
				.where(eq(orders.id, order1.id));
			await db.update(orders).set({ createdAt: new Date() }).where(eq(orders.id, order2.id));

			const orderService = container.resolve(OrderService);
			const recentOrders = await orderService.getRecentOrdersForBuyer(buyer.telegramChatId);

			expect(recentOrders).toHaveLength(2);

			// First should be order2 (most recent)
			expect(recentOrders[0]!.order.id).toBe(order2.id);
			expect(recentOrders[0]!.catalogItemName).toBe("Service B");
			expect(recentOrders[0]!.order.usdPriceSnapshot).toBe("20.00");
			expect(recentOrders[0]!.order.status).toBe("PLACED");

			// Second should be order1
			expect(recentOrders[1]!.order.id).toBe(order1.id);
			expect(recentOrders[1]!.catalogItemName).toBe("Service A");
			expect(recentOrders[1]!.order.usdPriceSnapshot).toBe("10.00");
		});

		it("respects the limit argument and isolates orders by buyer", async () => {
			const { buyer: buyer1, wallet: wallet1 } = await createTestBuyer(container, {
				telegramChatId: 20003,
				telegramUsername: "buyer_limit_test",
			});
			const { buyer: buyer2, wallet: wallet2 } = await createTestBuyer(container, {
				telegramChatId: 20004,
				telegramUsername: "buyer_other",
			});

			await db.update(wallets).set({ availableBalance: "1000.00" }).where(eq(wallets.id, wallet1.id));
			await db.update(wallets).set({ availableBalance: "1000.00" }).where(eq(wallets.id, wallet2.id));

			const item = await createTestCatalogItem(container, {
				name: "Common Item",
				usdPrice: "5.00",
				isActive: true,
			});

			// Create 3 orders for buyer1
			for (let i = 0; i < 3; i++) {
				await placeTestOrder(container, {
					userId: buyer1.id,
					catalogItemId: item.id,
				});
			}

			// Create 1 order for buyer2
			await placeTestOrder(container, {
				userId: buyer2.id,
				catalogItemId: item.id,
			});

			const orderService = container.resolve(OrderService);

			// Limit to 2 for buyer1
			const limitedOrders = await orderService.getRecentOrdersForBuyer(buyer1.telegramChatId, 2);
			expect(limitedOrders).toHaveLength(2);

			// Orders for buyer2
			const buyer2Orders = await orderService.getRecentOrdersForBuyer(buyer2.telegramChatId);
			expect(buyer2Orders).toHaveLength(1);
			expect(buyer2Orders[0]!.order.userId).toBe(buyer2.id);
		});
	});

	describe("OrderService.getOrderCountBreakdown", () => {
		it("returns zero counts when buyer has no orders", async () => {
			const { buyer } = await createTestBuyer(container, {
				telegramChatId: 20010,
				telegramUsername: "buyer_zero_breakdown",
			});

			const orderService = container.resolve(OrderService);
			const breakdown = await orderService.getOrderCountBreakdown(buyer.telegramChatId);

			expect(breakdown).toEqual({
				fulfilled: 0,
				inProgress: 0,
				cancelled: 0,
			});
		});

		it("correctly buckets orders into fulfilled, inProgress, and cancelled", async () => {
			const { buyer, wallet } = await createTestBuyer(container, {
				telegramChatId: 20011,
				telegramUsername: "buyer_breakdown",
			});

			await db.update(wallets).set({ availableBalance: "1000.00" }).where(eq(wallets.id, wallet.id));

			const item = await createTestCatalogItem(container, {
				name: "Service Item",
				usdPrice: "10.00",
				isActive: true,
			});

			// 1. PLACED (inProgress)
			await placeTestOrder(container, {
				userId: buyer.id,
				catalogItemId: item.id,
			});

			// 2. PROCESSING (inProgress)
			const { order: orderProcessing } = await placeTestOrder(container, {
				userId: buyer.id,
				catalogItemId: item.id,
			});
			await claimTestOrder(container, {
				orderId: orderProcessing.id,
				adminTelegramId: 99999n,
			});

			// 3. FULFILLED (fulfilled)
			const { order: orderFulfilled } = await placeTestOrder(container, {
				userId: buyer.id,
				catalogItemId: item.id,
			});
			await db
				.update(orders)
				.set({
					status: "FULFILLED",
					deliveryContent: "token-secret",
					fulfilledAt: new Date(),
				})
				.where(eq(orders.id, orderFulfilled.id));

			// 4. CANCELLED (cancelled)
			const { order: orderCancelled } = await placeTestOrder(container, {
				userId: buyer.id,
				catalogItemId: item.id,
			});
			await db
				.update(orders)
				.set({
					status: "CANCELLED",
					cancelledAt: new Date(),
				})
				.where(eq(orders.id, orderCancelled.id));

			// 5. REJECTED (cancelled)
			const { order: orderRejected } = await placeTestOrder(container, {
				userId: buyer.id,
				catalogItemId: item.id,
			});
			await db
				.update(orders)
				.set({
					status: "REJECTED",
					rejectionCategory: "OUT_OF_STOCK",
					rejectedAt: new Date(),
				})
				.where(eq(orders.id, orderRejected.id));

			const orderService = container.resolve(OrderService);
			const breakdown = await orderService.getOrderCountBreakdown(buyer.telegramChatId);

			expect(breakdown).toEqual({
				fulfilled: 1,
				inProgress: 2, // PLACED + PROCESSING
				cancelled: 2, // CANCELLED + REJECTED
			});
		});

		it("isolates order count breakdown by buyer", async () => {
			const { buyer: buyer1, wallet: wallet1 } = await createTestBuyer(container, {
				telegramChatId: 20012,
				telegramUsername: "buyer_one_breakdown",
			});
			const { buyer: buyer2, wallet: wallet2 } = await createTestBuyer(container, {
				telegramChatId: 20013,
				telegramUsername: "buyer_two_breakdown",
			});

			await db.update(wallets).set({ availableBalance: "500.00" }).where(eq(wallets.id, wallet1.id));
			await db.update(wallets).set({ availableBalance: "500.00" }).where(eq(wallets.id, wallet2.id));

			const item = await createTestCatalogItem(container, {
				name: "Item",
				usdPrice: "10.00",
				isActive: true,
			});

			// Buyer 1 gets 1 PLACED order
			await placeTestOrder(container, {
				userId: buyer1.id,
				catalogItemId: item.id,
			});

			// Buyer 2 gets 2 PLACED orders
			await placeTestOrder(container, {
				userId: buyer2.id,
				catalogItemId: item.id,
			});
			await placeTestOrder(container, {
				userId: buyer2.id,
				catalogItemId: item.id,
			});

			const orderService = container.resolve(OrderService);
			const breakdown1 = await orderService.getOrderCountBreakdown(buyer1.telegramChatId);
			const breakdown2 = await orderService.getOrderCountBreakdown(buyer2.telegramChatId);

			expect(breakdown1.inProgress).toBe(1);
			expect(breakdown2.inProgress).toBe(2);
		});
	});

	describe("LedgerService.getRecentWalletTransactions", () => {
		it("returns empty array when wallet has no transactions", async () => {
			const { wallet } = await createTestBuyer(container, {
				telegramChatId: 20020,
				telegramUsername: "buyer_no_tx",
			});

			const ledgerService = container.resolve(LedgerService);
			const txsFromLedger = await ledgerService.getRecentWalletTransactions(wallet.id);

			expect(txsFromLedger).toEqual([]);
		});

		it("returns BUYER_WALLET entries in descending date order, joined with narrative", async () => {
			const { buyer, wallet } = await createTestBuyer(container, {
				telegramChatId: 20021,
				telegramUsername: "buyer_tx_history",
			});

			await db.update(wallets).set({ availableBalance: "500.00" }).where(eq(wallets.id, wallet.id));

			const ledgerService = container.resolve(LedgerService);

			// Insert a topUpRequest to satisfy foreign key
			const [topUpReq] = await db
				.insert(topUpRequests)
				.values({
					userId: buyer.id,
					lockedIrrPerUsd: 600000n,
					rateSource: "MANUAL",
					usdAmount: "50.00",
					irrAmount: 30000000n,
					status: "APPROVED",
					expiresAt: new Date(Date.now() + 3600000),
				})
				.returning();

			// Record top-up credit: +$50.00
			await ledgerService.recordTopUpCredit(
				{
					topUpRequestId: topUpReq!.id,
					walletId: wallet.id,
					usdAmount: "50.00",
				},
				db,
			);

			// Place an order: -$15.00
			const item = await createTestCatalogItem(container, {
				name: "Item Tx",
				usdPrice: "15.00",
				isActive: true,
			});
			await placeTestOrder(container, {
				userId: buyer.id,
				catalogItemId: item.id,
			});

			const txs = await ledgerService.getRecentWalletTransactions(wallet.id);

			expect(txs).toHaveLength(2);

			// 1. Most recent: Order placement spend (DEBIT)
			expect(txs[0]!.entry.accountType).toBe("BUYER_WALLET");
			expect(txs[0]!.entry.direction).toBe("DEBIT");
			expect(txs[0]!.entry.usdAmount.toFixed(2)).toBe("15.00");
			expect(txs[0]!.narrative).toContain("Order placement spend");

			// 2. Older: Top-up credit (CREDIT)
			expect(txs[1]!.entry.accountType).toBe("BUYER_WALLET");
			expect(txs[1]!.entry.direction).toBe("CREDIT");
			expect(txs[1]!.entry.usdAmount.toFixed(2)).toBe("50.00");
			expect(txs[1]!.narrative).toContain("Top-up approval");
		});

		it("respects limit and isolates transactions by walletId", async () => {
			const { wallet: wallet1 } = await createTestBuyer(container, {
				telegramChatId: 20022,
				telegramUsername: "buyer_tx_limit1",
			});
			const { wallet: wallet2 } = await createTestBuyer(container, {
				telegramChatId: 20023,
				telegramUsername: "buyer_tx_limit2",
			});

			const ledgerService = container.resolve(LedgerService);

			// Add 3 transactions to wallet1
			for (let i = 1; i <= 3; i++) {
				const [req1] = await db
					.insert(topUpRequests)
					.values({
						userId: wallet1.userId,
						lockedIrrPerUsd: 600000n,
						rateSource: "MANUAL",
						usdAmount: `${i * 10}.00`,
						irrAmount: BigInt(i * 10 * 600000),
						status: "APPROVED",
						expiresAt: new Date(Date.now() + 3600000),
					})
					.returning();

				await ledgerService.recordTopUpCredit(
					{
						topUpRequestId: req1!.id,
						walletId: wallet1.id,
						usdAmount: `${i * 10}.00`,
					},
					db,
				);
			}

			// Add 1 transaction to wallet2
			const [req2] = await db
				.insert(topUpRequests)
				.values({
					userId: wallet2.userId,
					lockedIrrPerUsd: 600000n,
					rateSource: "MANUAL",
					usdAmount: "99.00",
					irrAmount: 99n * 600000n,
					status: "APPROVED",
					expiresAt: new Date(Date.now() + 3600000),
				})
				.returning();

			await ledgerService.recordTopUpCredit(
				{
					topUpRequestId: req2!.id,
					walletId: wallet2.id,
					usdAmount: "99.00",
				},
				db,
			);

			const txsLimited = await ledgerService.getRecentWalletTransactions(wallet1.id, 2);
			expect(txsLimited).toHaveLength(2);

			const wallet2Txs = await ledgerService.getRecentWalletTransactions(wallet2.id);
			expect(wallet2Txs).toHaveLength(1);
			expect(wallet2Txs[0]!.entry.usdAmount.toFixed(2)).toBe("99.00");
		});
	});

	describe("OrderService.getOrderDetailForBuyer", () => {
		it("returns order with catalogItem and buyer when owned by the buyer", async () => {
			const { buyer, wallet } = await createTestBuyer(container, {
				telegramChatId: 20020,
				telegramUsername: "detail_buyer",
			});

			await db.update(wallets).set({ availableBalance: "500.00" }).where(eq(wallets.id, wallet.id));

			const item = await createTestCatalogItem(container, {
				name: "Spotify Premium 1 Year",
				usdPrice: "14.99",
				isActive: true,
			});

			const { order } = await placeTestOrder(container, {
				userId: buyer.id,
				catalogItemId: item.id,
			});

			const orderService = container.resolve(OrderService);
			const result = await orderService.getOrderDetailForBuyer({
				orderId: order.id,
				telegramChatId: buyer.telegramChatId,
			});

			expect(result).not.toBeNull();
			expect(result!.order.id).toBe(order.id);
			expect(result!.order.status).toBe("PLACED");
			expect(result!.catalogItem).not.toBeNull();
			expect(result!.catalogItem!.name).toBe("Spotify Premium 1 Year");
			expect(result!.buyer.id).toBe(buyer.id);
		});

		it("returns null when order belongs to a different buyer", async () => {
			const { buyer: owner, wallet } = await createTestBuyer(container, {
				telegramChatId: 20021,
				telegramUsername: "owner_user",
			});
			const { buyer: otherBuyer } = await createTestBuyer(container, {
				telegramChatId: 20022,
				telegramUsername: "other_user",
			});

			await db.update(wallets).set({ availableBalance: "500.00" }).where(eq(wallets.id, wallet.id));

			const item = await createTestCatalogItem(container, {
				name: "Item",
				usdPrice: "10.00",
			});

			const { order } = await placeTestOrder(container, {
				userId: owner.id,
				catalogItemId: item.id,
			});

			const orderService = container.resolve(OrderService);
			const result = await orderService.getOrderDetailForBuyer({
				orderId: order.id,
				telegramChatId: otherBuyer.telegramChatId,
			});

			expect(result).toBeNull();
		});

		it("returns null when order does not exist", async () => {
			const { buyer } = await createTestBuyer(container, {
				telegramChatId: 20023,
				telegramUsername: "buyer_nonexistent",
			});

			const orderService = container.resolve(OrderService);
			const result = await orderService.getOrderDetailForBuyer({
				orderId: "00000000-0000-0000-0000-000000000000",
				telegramChatId: buyer.telegramChatId,
			});

			expect(result).toBeNull();
		});
	});
});
