import type { Order, OrderAdminNotification } from '@/modules/order/order.entity';
import type { Wallet } from '@/modules/wallet/wallet.entity';
import type { LedgerTransaction } from '@/modules/ledger/ledger-transaction.entity';
import type { LedgerEntry } from '@/modules/ledger/ledger-entry.entity';
import type { CatalogItem } from '@/modules/catalog/catalog.entity';
import type { Buyer } from '@/modules/buyer/buyer.entity';

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

export interface OrderAdminNotificationContext {
  order: Order;
  catalogItem: CatalogItem;
  buyer: Buyer;
  postDebitBalance: string;
}

export interface PlaceOrderDependencies {
  notifyAdmins?: (
    context: OrderAdminNotificationContext
  ) => Promise<OrderAdminNotificationPayload[]>;
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

export interface ClaimOrderNotificationContext {
  order: Order;
  notifications: OrderAdminNotification[];
  claimedByAdminTelegramId: bigint;
  claimedByAdminUsername?: string | null | undefined;
}

export interface ClaimOrderDependencies {
  updateAdminNotifications?: (
    context: ClaimOrderNotificationContext
  ) => Promise<void>;
}

export interface ClaimOrderResult {
  order: Order;
  adminNotifications: OrderAdminNotification[];
}

export interface FulfilOrderInput {
  orderId: string;
  adminTelegramId: bigint | number | string;
  deliveryContent: string;
}

export interface FulfilOrderBuyerNotificationContext {
  order: Order;
  buyer: Buyer;
  deliveryContent: string;
}

export interface FulfilOrderNotificationContext {
  order: Order;
  buyer: Buyer;
  deliveryContent: string;
  notifications: OrderAdminNotification[];
  adminTelegramId: bigint;
}

export interface FulfilOrderDependencies {
  notifyBuyer?: (
    context: FulfilOrderBuyerNotificationContext
  ) => Promise<void>;
  updateAdminNotifications?: (
    context: FulfilOrderNotificationContext
  ) => Promise<void>;
}

export interface FulfilOrderResult {
  order: Order;
  buyer: Buyer;
  adminNotifications: OrderAdminNotification[];
}

export interface RejectOrderInput {
  orderId: string;
  adminTelegramId?: bigint | number | string | undefined;
  rejectionCategory: string;
  rejectionNote?: string | null | undefined;
}

export interface RejectOrderBuyerNotificationContext {
  order: Order;
  buyer: Buyer;
  rejectionCategory: string;
  rejectionNote?: string | null | undefined;
  refundAmount: string;
  updatedBalance: string;
}

export interface RejectOrderNotificationContext {
  order: Order;
  buyer: Buyer;
  rejectionCategory: string;
  rejectionNote?: string | null | undefined;
  notifications: OrderAdminNotification[];
  adminTelegramId?: bigint | undefined;
}

export interface RejectOrderDependencies {
  notifyBuyer?: (
    context: RejectOrderBuyerNotificationContext
  ) => Promise<void>;
  updateAdminNotifications?: (
    context: RejectOrderNotificationContext
  ) => Promise<void>;
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

export interface CancelOrderBuyerNotificationContext {
  order: Order;
  buyer: Buyer;
  refundAmount: string;
  updatedBalance: string;
}

export interface CancelOrderNotificationContext {
  order: Order;
  buyer: Buyer;
  refundAmount: string;
  updatedBalance: string;
  notifications: OrderAdminNotification[];
}

export interface CancelOrderDependencies {
  notifyBuyer?: (
    context: CancelOrderBuyerNotificationContext
  ) => Promise<void>;
  updateAdminNotifications?: (
    context: CancelOrderNotificationContext
  ) => Promise<void>;
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


