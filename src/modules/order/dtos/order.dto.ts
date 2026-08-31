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
