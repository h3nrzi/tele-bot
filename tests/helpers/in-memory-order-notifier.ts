import type {
	IOrderNotifier,
	OnOrderPlacedContext,
	OnOrderClaimedContext,
	OnOrderFulfilledContext,
	OnOrderRejectedContext,
	OnOrderCancelledContext,
} from "@/modules/order/order.notifier.interface";

/**
 * In-memory test helper implementation of IOrderNotifier.
 * Records dispatched notification contexts without triggering external side effects.
 */
export class InMemoryOrderNotifier implements IOrderNotifier {
	public recordedPlaced: OnOrderPlacedContext[] = [];
	public recordedClaimed: OnOrderClaimedContext[] = [];
	public recordedFulfilled: OnOrderFulfilledContext[] = [];
	public recordedRejected: OnOrderRejectedContext[] = [];
	public recordedCancelled: OnOrderCancelledContext[] = [];

	async onOrderPlaced(context: OnOrderPlacedContext): Promise<void> {
		this.recordedPlaced.push(context);
	}

	async onOrderClaimed(context: OnOrderClaimedContext): Promise<void> {
		this.recordedClaimed.push(context);
	}

	async onOrderFulfilled(context: OnOrderFulfilledContext): Promise<void> {
		this.recordedFulfilled.push(context);
	}

	async onOrderRejected(context: OnOrderRejectedContext): Promise<void> {
		this.recordedRejected.push(context);
	}

	async onOrderCancelled(context: OnOrderCancelledContext): Promise<void> {
		this.recordedCancelled.push(context);
	}

	reset(): void {
		this.recordedPlaced = [];
		this.recordedClaimed = [];
		this.recordedFulfilled = [];
		this.recordedRejected = [];
		this.recordedCancelled = [];
	}
}
