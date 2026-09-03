import { UsdAmount } from '@/core/shared/money.vo';

export type OrderStatus =
  | 'PLACED'
  | 'PROCESSING'
  | 'FULFILLED'
  | 'REJECTED'
  | 'CANCELLED';

export interface OrderProps {
  id: string;
  userId: string;
  catalogItemId: string;
  usdPriceSnapshot: string | UsdAmount;
  status: OrderStatus;
  deliveryContent?: string | null;
  rejectionCategory?: string | null;
  rejectionNote?: string | null;
  claimedByAdminTelegramId?: bigint | number | string | null;
  claimedAt?: Date | null;
  fulfilledAt?: Date | null;
  rejectedAt?: Date | null;
  cancelledAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Order Domain Aggregate.
 * Represents a Buyer's purchase of exactly one unit of one Catalog Item with an immutable price snapshot.
 */
export class Order {
  public readonly id: string;
  public readonly userId: string;
  public readonly catalogItemId: string;
  private readonly _usdPriceSnapshot: UsdAmount;
  public readonly status: OrderStatus;
  public readonly deliveryContent: string | null;
  public readonly rejectionCategory: string | null;
  public readonly rejectionNote: string | null;
  public readonly claimedByAdminTelegramId: bigint | null;
  public readonly claimedAt: Date | null;
  public readonly fulfilledAt: Date | null;
  public readonly rejectedAt: Date | null;
  public readonly cancelledAt: Date | null;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(props: OrderProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.catalogItemId = props.catalogItemId;
    this._usdPriceSnapshot =
      props.usdPriceSnapshot instanceof UsdAmount
        ? props.usdPriceSnapshot
        : new UsdAmount(props.usdPriceSnapshot);
    this.status = props.status;
    this.deliveryContent = props.deliveryContent ?? null;
    this.rejectionCategory = props.rejectionCategory ?? null;
    this.rejectionNote = props.rejectionNote ?? null;
    this.claimedByAdminTelegramId =
      props.claimedByAdminTelegramId !== undefined && props.claimedByAdminTelegramId !== null
        ? BigInt(props.claimedByAdminTelegramId)
        : null;
    this.claimedAt = props.claimedAt ?? null;
    this.fulfilledAt = props.fulfilledAt ?? null;
    this.rejectedAt = props.rejectedAt ?? null;
    this.cancelledAt = props.cancelledAt ?? null;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public get usdPriceSnapshot(): string {
    return this._usdPriceSnapshot.toFixed(2);
  }

  public get usdAmountVo(): UsdAmount {
    return this._usdPriceSnapshot;
  }

  public isTerminal(): boolean {
    return (
      this.status === 'FULFILLED' ||
      this.status === 'REJECTED' ||
      this.status === 'CANCELLED'
    );
  }
}

export interface OrderAdminNotificationProps {
  id: string;
  orderId: string;
  adminTelegramId: bigint | number | string;
  chatId: bigint | number | string;
  messageId: bigint | number | string;
  createdAt: Date;
}

/**
 * OrderAdminNotification Domain Entity.
 * Represents a Telegram push message sent to an Admin for an Order.
 */
export class OrderAdminNotification {
  public readonly id: string;
  public readonly orderId: string;
  public readonly adminTelegramId: bigint;
  public readonly chatId: bigint;
  public readonly messageId: bigint;
  public readonly createdAt: Date;

  constructor(props: OrderAdminNotificationProps) {
    this.id = props.id;
    this.orderId = props.orderId;
    this.adminTelegramId = BigInt(props.adminTelegramId);
    this.chatId = BigInt(props.chatId);
    this.messageId = BigInt(props.messageId);
    this.createdAt = props.createdAt;
  }
}
