import type { Buyer } from "@/modules/buyer/buyer.entity";
import type { CatalogItem } from "@/modules/catalog/catalog.entity";
import type { LedgerEntry } from "@/modules/ledger/entities/ledger-entry.entity";
import type { LedgerTransaction } from "@/modules/ledger/entities/ledger-transaction.entity";
import type { Order, OrderAdminNotification, OrderStatus } from "@/modules/order/order.entity";
import type { Wallet } from "@/modules/wallet/wallet.entity";

export interface PlaceOrderInput {
	userId?: string | undefined;
	telegramChatId?: bigint | number | undefined;
	catalogItemId: string;
}

export interface OrderAdminNotificationPayload {
	adminTelegramId: bigint;
	chatId: bigint;
	messageId: bigint;
}

export interface PlaceOrderResult {
	order: Order;
	wallet: Wallet;
	ledgerTransaction: LedgerTransaction;
	ledgerEntries: LedgerEntry[];
	catalogItem: CatalogItem;
	buyer: Buyer;
	adminNotifications: OrderAdminNotification[];
}

export interface ClaimOrderInput {
	orderId: string;
	adminTelegramId: bigint | number | string;
	adminUsername?: string | null | undefined;
}

export interface ClaimOrderResult {
	order: Order;
	adminNotifications: OrderAdminNotification[];
}

export interface FulfilOrderInput {
	orderId: string;
	adminTelegramId: bigint | number | string;
	adminUsername?: string | null | undefined;
	deliveryContent: string;
}

export interface FulfilOrderResult {
	order: Order;
	buyer: Buyer;
	adminNotifications: OrderAdminNotification[];
}

export interface RejectOrderInput {
	orderId: string;
	adminTelegramId?: bigint | number | string | undefined;
	adminUsername?: string | null | undefined;
	rejectionCategory: string;
	rejectionNote?: string | null | undefined;
}

export interface RejectOrderResult {
	order: Order;
	wallet: Wallet;
	buyer: Buyer;
	refundLedgerTransaction: LedgerTransaction;
	adminNotifications: OrderAdminNotification[];
}

export interface CancelOrderInput {
	orderId: string;
	userId?: string | undefined;
	telegramChatId?: bigint | number | string | undefined;
}

export interface CancelOrderResult {
	order: Order;
	wallet: Wallet;
	buyer: Buyer;
	refundLedgerTransaction: LedgerTransaction;
	adminNotifications: OrderAdminNotification[];
}

export interface GetLatestOrderInput {
	userId?: string | undefined;
	telegramChatId?: bigint | number | string | undefined;
}

export interface BuyerLatestOrderResult {
	order: Order;
	catalogItem: CatalogItem | null;
	buyer: Buyer;
}

export interface AdminOrderQueueItem {
	id: string;
	userId: string;
	catalogItemId: string;
	catalogItemName: string;
	usdPriceSnapshot: string;
	status: OrderStatus;
	buyerTelegramChatId: bigint;
	buyerTelegramUsername: string | null;
	claimedByAdminTelegramId: bigint | null;
	claimedByAdminUsername?: string | null | undefined;
	claimedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface RecentOrderWithCatalogItem {
	order: Order;
	catalogItemName: string;
}

export interface OrderCountBreakdownResult {
	fulfilled: number;
	inProgress: number;
	cancelled: number;
}

export interface GetOrderDetailForBuyerInput {
	orderId: string;
	telegramChatId?: bigint | number | string | undefined;
	userId?: string | undefined;
}

export interface BuyerOrderDetailResult {
	order: Order;
	catalogItem: CatalogItem | null;
	buyer: Buyer;
}

