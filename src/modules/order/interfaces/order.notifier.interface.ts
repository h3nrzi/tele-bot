import type { Order, OrderAdminNotification } from "@/modules/order/order.entity";
import type { CatalogItem } from "@/modules/catalog/catalog.entity";
import type { Buyer } from "@/modules/buyer/buyer.entity";

export interface OnOrderPlacedContext {
	order: Order;
	catalogItem: CatalogItem;
	buyer: Buyer;
	postDebitBalance: string;
}

export interface OnOrderClaimedContext {
	order: Order;
	notifications: OrderAdminNotification[];
	claimedByAdminTelegramId: bigint;
	claimedByAdminUsername?: string | null | undefined;
	catalogItem?: CatalogItem | undefined;
	buyer?: Buyer | undefined;
	revealedPassword?: string | undefined;
	buyerBalance?: string | undefined;
}

export interface OnOrderFulfilledContext {
	order: Order;
	buyer: Buyer;
	deliveryContent?: string | null | undefined;
	notifications: OrderAdminNotification[];
	adminTelegramId: bigint;
	adminUsername?: string | null | undefined;
}

export interface OnOrderRejectedContext {
	order: Order;
	buyer: Buyer;
	rejectionCategory: string;
	rejectionNote?: string | null | undefined;
	refundAmount: string;
	updatedBalance: string;
	notifications: OrderAdminNotification[];
	adminTelegramId?: bigint | undefined;
	adminUsername?: string | null | undefined;
}

export interface OnOrderCancelledContext {
	order: Order;
	buyer: Buyer;
	refundAmount: string;
	updatedBalance: string;
	notifications: OrderAdminNotification[];
}

export interface IOrderNotifier {
	/**
	 * Dispatches push notifications to admins when an order is placed,
	 * and persists order_admin_notifications records.
	 */
	onOrderPlaced(context: OnOrderPlacedContext): Promise<void>;

	/**
	 * Updates admin notifications to PROCESSING state when an order is claimed.
	 */
	onOrderClaimed(context: OnOrderClaimedContext): Promise<void>;

	/**
	 * Sends delivery content to the buyer and updates admin notifications to FULFILLED state.
	 */
	onOrderFulfilled(context: OnOrderFulfilledContext): Promise<void>;

	/**
	 * Sends rejection notice to the buyer and updates admin notifications to REJECTED state.
	 */
	onOrderRejected(context: OnOrderRejectedContext): Promise<void>;

	/**
	 * Sends cancellation notice to the buyer and updates admin notifications to CANCELLED state.
	 */
	onOrderCancelled(context: OnOrderCancelledContext): Promise<void>;
}
