import { injectable, inject } from 'tsyringe';
import { eq, desc } from 'drizzle-orm';
import { orders, orderAdminNotifications } from '@/modules/order/order.schema';
import { getDefaultDb, type DbClient } from '@/core/database/client';
import type { DbExecutor } from '@/core/database/types';
import {
  Order,
  OrderAdminNotification,
  type OrderStatus,
} from '@/modules/order/order.entity';
import type {
  IOrderRepository,
  CreateOrderParams,
  CreateOrderAdminNotificationParams,
  UpdateOrderStatusFields,
} from '@/modules/order/order.repository.interface';
import { UsdAmount } from '@/core/shared/money.vo';
import { TOKENS } from '@/core/di/tokens';

@injectable()
export class DrizzleOrderRepository implements IOrderRepository<DbExecutor> {
  constructor(
    @inject(TOKENS.DbClient) private readonly defaultDb?: DbClient
  ) {}

  private getDb(executor?: DbExecutor): DbExecutor {
    return executor ?? this.defaultDb ?? getDefaultDb();
  }

  public async create(
    params: CreateOrderParams,
    executor?: DbExecutor
  ): Promise<Order> {
    const db = this.getDb(executor);
    const priceStr =
      params.usdPriceSnapshot instanceof UsdAmount
        ? params.usdPriceSnapshot.toFixed(2)
        : params.usdPriceSnapshot;

    const [row] = await db
      .insert(orders)
      .values({
        userId: params.userId,
        catalogItemId: params.catalogItemId,
        usdPriceSnapshot: priceStr,
        status: params.status ?? 'PLACED',
      })
      .returning();

    if (!row) {
      throw new Error('Failed to create order');
    }

    return this.mapOrderToEntity(row);
  }

  public async findById(
    id: string,
    executor?: DbExecutor
  ): Promise<Order | null> {
    const db = this.getDb(executor);
    const [row] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1);

    if (!row) {
      return null;
    }

    return this.mapOrderToEntity(row);
  }

  public async findByIdForUpdate(
    id: string,
    executor: DbExecutor
  ): Promise<Order | null> {
    const [row] = await executor
      .select()
      .from(orders)
      .where(eq(orders.id, id))
      .for('update')
      .limit(1);

    if (!row) {
      return null;
    }

    return this.mapOrderToEntity(row);
  }

  public async findLatestByUserId(
    userId: string,
    executor?: DbExecutor
  ): Promise<Order | null> {
    const db = this.getDb(executor);
    const [row] = await db
      .select()
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt))
      .limit(1);

    if (!row) {
      return null;
    }

    return this.mapOrderToEntity(row);
  }

  public async createAdminNotification(
    params: CreateOrderAdminNotificationParams,
    executor?: DbExecutor
  ): Promise<OrderAdminNotification> {
    const db = this.getDb(executor);
    const [row] = await db
      .insert(orderAdminNotifications)
      .values({
        orderId: params.orderId,
        adminTelegramId: BigInt(params.adminTelegramId),
        chatId: BigInt(params.chatId),
        messageId: BigInt(params.messageId),
      })
      .returning();

    if (!row) {
      throw new Error('Failed to create order admin notification');
    }

    return this.mapNotificationToEntity(row);
  }

  public async createAdminNotifications(
    paramsList: CreateOrderAdminNotificationParams[],
    executor?: DbExecutor
  ): Promise<OrderAdminNotification[]> {
    if (paramsList.length === 0) {
      return [];
    }

    const db = this.getDb(executor);
    const valuesToInsert = paramsList.map((params) => ({
      orderId: params.orderId,
      adminTelegramId: BigInt(params.adminTelegramId),
      chatId: BigInt(params.chatId),
      messageId: BigInt(params.messageId),
    }));

    const rows = await db
      .insert(orderAdminNotifications)
      .values(valuesToInsert)
      .returning();

    return rows.map((row) => this.mapNotificationToEntity(row));
  }

  public async getAdminNotifications(
    orderId: string,
    executor?: DbExecutor
  ): Promise<OrderAdminNotification[]> {
    const db = this.getDb(executor);
    const rows = await db
      .select()
      .from(orderAdminNotifications)
      .where(eq(orderAdminNotifications.orderId, orderId));

    return rows.map((row) => this.mapNotificationToEntity(row));
  }

  public async updateStatus(
    id: string,
    status: OrderStatus,
    fields?: UpdateOrderStatusFields,
    executor?: DbExecutor
  ): Promise<Order | null> {
    const db = this.getDb(executor);
    const updateValues: Record<string, unknown> = {
      status,
      updatedAt: fields?.updatedAt ?? new Date(),
    };

    if (fields?.claimedByAdminTelegramId !== undefined) {
      updateValues.claimedByAdminTelegramId =
        fields.claimedByAdminTelegramId !== null
          ? BigInt(fields.claimedByAdminTelegramId)
          : null;
    }
    if (fields?.claimedAt !== undefined) {
      updateValues.claimedAt = fields.claimedAt;
    }
    if (fields?.fulfilledAt !== undefined) {
      updateValues.fulfilledAt = fields.fulfilledAt;
    }
    if (fields?.rejectedAt !== undefined) {
      updateValues.rejectedAt = fields.rejectedAt;
    }
    if (fields?.cancelledAt !== undefined) {
      updateValues.cancelledAt = fields.cancelledAt;
    }
    if (fields?.deliveryContent !== undefined) {
      updateValues.deliveryContent = fields.deliveryContent;
    }
    if (fields?.rejectionCategory !== undefined) {
      updateValues.rejectionCategory = fields.rejectionCategory;
    }
    if (fields?.rejectionNote !== undefined) {
      updateValues.rejectionNote = fields.rejectionNote;
    }

    const [row] = await db
      .update(orders)
      .set(updateValues)
      .where(eq(orders.id, id))
      .returning();

    if (!row) {
      return null;
    }

    return this.mapOrderToEntity(row);
  }

  private mapOrderToEntity(row: typeof orders.$inferSelect): Order {
    return new Order({
      id: row.id,
      userId: row.userId,
      catalogItemId: row.catalogItemId,
      usdPriceSnapshot: row.usdPriceSnapshot,
      status: row.status,
      deliveryContent: row.deliveryContent,
      rejectionCategory: row.rejectionCategory,
      rejectionNote: row.rejectionNote,
      claimedByAdminTelegramId: row.claimedByAdminTelegramId,
      claimedAt: row.claimedAt,
      fulfilledAt: row.fulfilledAt,
      rejectedAt: row.rejectedAt,
      cancelledAt: row.cancelledAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  private mapNotificationToEntity(
    row: typeof orderAdminNotifications.$inferSelect
  ): OrderAdminNotification {
    return new OrderAdminNotification({
      id: row.id,
      orderId: row.orderId,
      adminTelegramId: row.adminTelegramId,
      chatId: row.chatId,
      messageId: row.messageId,
      createdAt: row.createdAt,
    });
  }
}

export const OrderRepository = DrizzleOrderRepository;
