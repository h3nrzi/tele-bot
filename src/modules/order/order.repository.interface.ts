import type { Order, OrderAdminNotification, OrderStatus } from '@/modules/order/order.entity';
import type { UsdAmount } from '@/core/shared/money.vo';

export interface CreateOrderParams {
  userId: string;
  catalogItemId: string;
  usdPriceSnapshot: UsdAmount | string;
  status?: OrderStatus | undefined;
}

export interface CreateOrderAdminNotificationParams {
  orderId: string;
  adminTelegramId: bigint | number | string;
  chatId: bigint | number | string;
  messageId: bigint | number | string;
}

export interface UpdateOrderStatusFields {
  claimedByAdminTelegramId?: bigint | number | string | null | undefined;
  claimedAt?: Date | null | undefined;
  fulfilledAt?: Date | null | undefined;
  rejectedAt?: Date | null | undefined;
  cancelledAt?: Date | null | undefined;
  deliveryContent?: string | null | undefined;
  rejectionCategory?: string | null | undefined;
  rejectionNote?: string | null | undefined;
  updatedAt?: Date | undefined;
}

/**
 * Domain Repository Interface for Orders and Order Admin Notifications.
 */
export interface IOrderRepository<TExecutor = unknown> {
  create(params: CreateOrderParams, executor?: TExecutor): Promise<Order>;
  findById(id: string, executor?: TExecutor): Promise<Order | null>;
  findByIdForUpdate(id: string, executor: TExecutor): Promise<Order | null>;
  findLatestByUserId(userId: string, executor?: TExecutor): Promise<Order | null>;
  createAdminNotification(
    params: CreateOrderAdminNotificationParams,
    executor?: TExecutor
  ): Promise<OrderAdminNotification>;
  createAdminNotifications(
    paramsList: CreateOrderAdminNotificationParams[],
    executor?: TExecutor
  ): Promise<OrderAdminNotification[]>;
  getAdminNotifications(
    orderId: string,
    executor?: TExecutor
  ): Promise<OrderAdminNotification[]>;
  updateStatus(
    id: string,
    status: OrderStatus,
    fields?: UpdateOrderStatusFields,
    executor?: TExecutor
  ): Promise<Order | null>;
}
