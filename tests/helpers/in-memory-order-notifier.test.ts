import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryOrderNotifier } from "./in-memory-order-notifier";
import type {
	OnOrderPlacedContext,
	OnOrderClaimedContext,
	OnOrderFulfilledContext,
	OnOrderRejectedContext,
	OnOrderCancelledContext,
} from "@/modules/order/interfaces/order.notifier.interface";

describe("InMemoryOrderNotifier", () => {
	let notifier: InMemoryOrderNotifier;

	const dummyPlacedContext: OnOrderPlacedContext = {
		order: { id: "order-1" } as any,
		catalogItem: { id: "item-1", name: "Item 1" } as any,
		buyer: { id: "buyer-1" } as any,
		postDebitBalance: "10.00",
	};

	const dummyClaimedContext: OnOrderClaimedContext = {
		order: { id: "order-1" } as any,
		notifications: [{ id: "notif-1" }] as any,
		claimedByAdminTelegramId: 123456789n,
		claimedByAdminUsername: "admin_user",
	};

	const dummyFulfilledContext: OnOrderFulfilledContext = {
		order: { id: "order-1" } as any,
		buyer: { id: "buyer-1" } as any,
		deliveryContent: "LICENSE-KEY-1234",
		notifications: [{ id: "notif-1" }] as any,
		adminTelegramId: 123456789n,
	};

	const dummyRejectedContext: OnOrderRejectedContext = {
		order: { id: "order-1" } as any,
		buyer: { id: "buyer-1" } as any,
		rejectionCategory: "OUT_OF_STOCK",
		rejectionNote: "Sorry, out of stock",
		refundAmount: "15.00",
		updatedBalance: "35.00",
		notifications: [{ id: "notif-1" }] as any,
		adminTelegramId: 123456789n,
	};

	const dummyCancelledContext: OnOrderCancelledContext = {
		order: { id: "order-1" } as any,
		buyer: { id: "buyer-1" } as any,
		refundAmount: "15.00",
		updatedBalance: "35.00",
		notifications: [{ id: "notif-1" }] as any,
	};

	beforeEach(() => {
		notifier = new InMemoryOrderNotifier();
	});

	it("starts with empty recorded arrays", () => {
		expect(notifier.recordedPlaced).toEqual([]);
		expect(notifier.recordedClaimed).toEqual([]);
		expect(notifier.recordedFulfilled).toEqual([]);
		expect(notifier.recordedRejected).toEqual([]);
		expect(notifier.recordedCancelled).toEqual([]);
	});

	it("records onOrderPlaced calls and maintains order across multiple calls", async () => {
		const secondPlacedContext: OnOrderPlacedContext = {
			...dummyPlacedContext,
			order: { id: "order-2" } as any,
			postDebitBalance: "20.00",
		};

		await notifier.onOrderPlaced(dummyPlacedContext);
		await notifier.onOrderPlaced(secondPlacedContext);

		expect(notifier.recordedPlaced).toHaveLength(2);
		expect(notifier.recordedPlaced[0]).toEqual(dummyPlacedContext);
		expect(notifier.recordedPlaced[1]).toEqual(secondPlacedContext);
	});

	it("records onOrderClaimed calls", async () => {
		await notifier.onOrderClaimed(dummyClaimedContext);

		expect(notifier.recordedClaimed).toHaveLength(1);
		expect(notifier.recordedClaimed[0]).toEqual(dummyClaimedContext);
	});

	it("records onOrderFulfilled calls", async () => {
		await notifier.onOrderFulfilled(dummyFulfilledContext);

		expect(notifier.recordedFulfilled).toHaveLength(1);
		expect(notifier.recordedFulfilled[0]).toEqual(dummyFulfilledContext);
	});

	it("records onOrderRejected calls", async () => {
		await notifier.onOrderRejected(dummyRejectedContext);

		expect(notifier.recordedRejected).toHaveLength(1);
		expect(notifier.recordedRejected[0]).toEqual(dummyRejectedContext);
	});

	it("records onOrderCancelled calls", async () => {
		await notifier.onOrderCancelled(dummyCancelledContext);

		expect(notifier.recordedCancelled).toHaveLength(1);
		expect(notifier.recordedCancelled[0]).toEqual(dummyCancelledContext);
	});

	it("resets all recorded arrays when reset() is called", async () => {
		await notifier.onOrderPlaced(dummyPlacedContext);
		await notifier.onOrderClaimed(dummyClaimedContext);
		await notifier.onOrderFulfilled(dummyFulfilledContext);
		await notifier.onOrderRejected(dummyRejectedContext);
		await notifier.onOrderCancelled(dummyCancelledContext);

		expect(notifier.recordedPlaced).toHaveLength(1);
		expect(notifier.recordedClaimed).toHaveLength(1);
		expect(notifier.recordedFulfilled).toHaveLength(1);
		expect(notifier.recordedRejected).toHaveLength(1);
		expect(notifier.recordedCancelled).toHaveLength(1);

		notifier.reset();

		expect(notifier.recordedPlaced).toEqual([]);
		expect(notifier.recordedClaimed).toEqual([]);
		expect(notifier.recordedFulfilled).toEqual([]);
		expect(notifier.recordedRejected).toEqual([]);
		expect(notifier.recordedCancelled).toEqual([]);
	});
});
