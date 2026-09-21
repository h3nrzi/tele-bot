import "reflect-metadata";
import { describe, it, expect, beforeEach } from "vitest";
import { setupTestDatabase } from "@tests/helpers/test-db";
import { Order } from "@/modules/order/order.entity";
import { OrderService } from "@/modules/order/order.service";
import { DrizzleOrderRepository } from "@/modules/order/order.repository";
import { CatalogService } from "@/modules/catalog/catalog.service";
import { createTestBuyer } from "@tests/helpers/fixtures";
import { wallets } from "@/modules/wallet/wallet.schema";
import { eq } from "drizzle-orm";

describe("Polymorphic Order Data Model", () => {
	const { db, container } = setupTestDatabase();
	let orderService: OrderService;
	let orderRepo: DrizzleOrderRepository;
	let catalogService: CatalogService;

	beforeEach(() => {
		orderService = container.resolve(OrderService);
		orderRepo = container.resolve(DrizzleOrderRepository);
		catalogService = container.resolve(CatalogService);
	});

	describe("Order Entity", () => {
		it("assigns default values for polymorphic fields when not specified", () => {
			const order = new Order({
				id: "00000000-0000-0000-0000-000000000001",
				userId: "00000000-0000-0000-0000-000000000002",
				catalogItemId: "00000000-0000-0000-0000-000000000003",
				usdPriceSnapshot: "10.00",
				status: "PLACED",
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			expect(order.fulfillmentStrategySnapshot).toBe("PAYLOAD_DELIVERY");
			expect(order.buyerInputs).toBeNull();
		});

		it("accepts and exposes custom fulfillmentStrategySnapshot and buyerInputs", () => {
			const inputs = {
				email: "buyer@example.com",
				password: { ciphertext: "abc", iv: "def", tag: "123" },
			};

			const order = new Order({
				id: "00000000-0000-0000-0000-000000000001",
				userId: "00000000-0000-0000-0000-000000000002",
				catalogItemId: "00000000-0000-0000-0000-000000000003",
				usdPriceSnapshot: "25.00",
				status: "PLACED",
				fulfillmentStrategySnapshot: "ACTIVATION",
				buyerInputs: inputs,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			expect(order.fulfillmentStrategySnapshot).toBe("ACTIVATION");
			expect(order.buyerInputs).toEqual(inputs);
		});
	});

	describe("Order Repository Persistence", () => {
		it("persists and retrieves fulfillmentStrategySnapshot and buyerInputs JSONB", async () => {
			const { buyer } = await createTestBuyer(container, {
				telegramChatId: 111222333,
				telegramUsername: "testbuyer",
			});

			const item = await catalogService.createCatalogItem({
				name: "Spotify Family Account",
				usdPrice: "10.00",
				catalogType: "DIRECT_ACCOUNT",
				fulfillmentStrategy: "ACTIVATION",
			});

			const buyerInputs = {
				email: "spotify@buyer.com",
				password: { ciphertext: "encrypted_hex", iv: "iv_hex", tag: "tag_hex" },
			};

			const createdOrder = await orderRepo.create({
				userId: buyer.id,
				catalogItemId: item.id,
				usdPriceSnapshot: item.usdPrice,
				status: "PLACED",
				fulfillmentStrategySnapshot: "ACTIVATION",
				buyerInputs,
			});

			expect(createdOrder.fulfillmentStrategySnapshot).toBe("ACTIVATION");
			expect(createdOrder.buyerInputs).toEqual(buyerInputs);

			const fetched = await orderRepo.findById(createdOrder.id);
			expect(fetched?.fulfillmentStrategySnapshot).toBe("ACTIVATION");
			expect(fetched?.buyerInputs).toEqual(buyerInputs);
		});

		it("allows updating buyerInputs via updateStatus", async () => {
			const { buyer } = await createTestBuyer(container, {
				telegramChatId: 222333444,
			});

			const item = await catalogService.createCatalogItem({
				name: "Direct Account Item",
				usdPrice: "15.00",
			});

			const createdOrder = await orderRepo.create({
				userId: buyer.id,
				catalogItemId: item.id,
				usdPriceSnapshot: item.usdPrice,
				status: "PLACED",
				buyerInputs: { email: "user@domain.com", password: "raw_or_encrypted" },
			});

			// Update status to FULFILLED and redact credentials in buyerInputs
			const updated = await orderRepo.updateStatus(createdOrder.id, "FULFILLED", {
				buyerInputs: { email: "user@domain.com", password: "[REDACTED]" },
			});

			expect(updated?.status).toBe("FULFILLED");
			expect(updated?.buyerInputs).toEqual({
				email: "user@domain.com",
				password: "[REDACTED]",
			});
		});
	});

	describe("OrderService.placeOrder Polymorphic Behavior", () => {
		it("automatically snapshots catalogItem fulfillmentStrategy and saves buyerInputs", async () => {
			const { buyer, wallet } = await createTestBuyer(container, {
				telegramChatId: 333444555,
				telegramUsername: "buyer_polymorphic",
			});

			// Fund buyer wallet
			await db.update(wallets).set({ availableBalance: "100.00" }).where(eq(wallets.id, wallet.id));

			// Create catalog item with ACTIVATION strategy
			const item = await catalogService.createCatalogItem({
				name: "ChatGPT Plus",
				usdPrice: "20.00",
				catalogType: "DIRECT_ACCOUNT",
				fulfillmentStrategy: "ACTIVATION",
			});

			const inputs = {
				email: "ai_user@example.com",
				password: { ciphertext: "cipher123", iv: "iv123", tag: "tag123" },
			};

			const result = await orderService.placeOrder({
				userId: buyer.id,
				catalogItemId: item.id,
				buyerInputs: inputs,
			});

			expect(result.order.status).toBe("PLACED");
			expect(result.order.fulfillmentStrategySnapshot).toBe("ACTIVATION");
			expect(result.order.buyerInputs).toEqual(inputs);

			// Check database row
			const fetchedOrder = await orderRepo.findById(result.order.id);
			expect(fetchedOrder?.fulfillmentStrategySnapshot).toBe("ACTIVATION");
			expect(fetchedOrder?.buyerInputs).toEqual(inputs);
		});

		it("backward compatibility: places order with default PAYLOAD_DELIVERY when no buyerInputs provided", async () => {
			const { buyer, wallet } = await createTestBuyer(container, {
				telegramChatId: 444555666,
			});

			await db.update(wallets).set({ availableBalance: "50.00" }).where(eq(wallets.id, wallet.id));

			const legacyItem = await catalogService.createCatalogItem({
				name: "Legacy Static Voucher",
				usdPrice: "10.00",
			});

			const result = await orderService.placeOrder({
				userId: buyer.id,
				catalogItemId: legacyItem.id,
			});

			expect(result.order.fulfillmentStrategySnapshot).toBe("PAYLOAD_DELIVERY");
			expect(result.order.buyerInputs).toBeNull();
		});
	});
});
