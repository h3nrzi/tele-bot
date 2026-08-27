import { UsdAmount, IrrAmount } from '@/domain/shared/money.vo';
import {
  TopUpRequestExpiredError,
  TopUpRequestNotPendingError,
  CannotCancelPendingTopUpError,
} from '@/domain/top-up/top-up.errors';

export type TopUpStatus =
  | 'INITIATED'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CANCELLED';

export interface TopUpRequestProps {
  id: string;
  userId: string;
  exchangeRateId: string;
  usdAmount: string | UsdAmount;
  irrAmount: bigint | number | string | IrrAmount;
  status: TopUpStatus;
  receiptFileId?: string | null;
  receiptCaption?: string | null;
  rejectionReason?: string | null;
  expiresAt: Date;
  processedByAdminTelegramId?: bigint | null;
  processedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * TopUpRequest Domain Aggregate.
 * Encapsulates the complete lifecycle and state transitions of a Buyer's top-up request.
 */
export class TopUpRequest {
  public readonly id: string;
  public readonly userId: string;
  public readonly exchangeRateId: string;
  private readonly _usdAmount: UsdAmount;
  private readonly _irrAmount: IrrAmount;
  private _status: TopUpStatus;
  private _receiptFileId: string | null;
  private _receiptCaption: string | null;
  private _rejectionReason: string | null;
  public readonly expiresAt: Date;
  private _processedByAdminTelegramId: bigint | null;
  private _processedAt: Date | null;
  public readonly createdAt: Date;
  private _updatedAt: Date;

  constructor(props: TopUpRequestProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.exchangeRateId = props.exchangeRateId;
    this._usdAmount =
      props.usdAmount instanceof UsdAmount
        ? props.usdAmount
        : new UsdAmount(props.usdAmount);
    this._irrAmount =
      props.irrAmount instanceof IrrAmount
        ? props.irrAmount
        : new IrrAmount(props.irrAmount);
    this._status = props.status;
    this._receiptFileId = props.receiptFileId ?? null;
    this._receiptCaption = props.receiptCaption ?? null;
    this._rejectionReason = props.rejectionReason ?? null;
    this.expiresAt = props.expiresAt;
    this._processedByAdminTelegramId = props.processedByAdminTelegramId ?? null;
    this._processedAt = props.processedAt ?? null;
    this.createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  public get usdAmount(): string {
    return this._usdAmount.toFixed(2);
  }

  public get usdAmountVo(): UsdAmount {
    return this._usdAmount;
  }

  public get irrAmount(): bigint {
    return this._irrAmount.toBigInt();
  }

  public get irrAmountVo(): IrrAmount {
    return this._irrAmount;
  }

  public get status(): TopUpStatus {
    return this._status;
  }

  public get receiptFileId(): string | null {
    return this._receiptFileId;
  }

  public get receiptCaption(): string | null {
    return this._receiptCaption;
  }

  public get rejectionReason(): string | null {
    return this._rejectionReason;
  }

  public get processedByAdminTelegramId(): bigint | null {
    return this._processedByAdminTelegramId;
  }

  public get processedAt(): Date | null {
    return this._processedAt;
  }

  public get updatedAt(): Date {
    return this._updatedAt;
  }

  public isExpired(now: Date = new Date()): boolean {
    return this.expiresAt.getTime() < now.getTime();
  }

  /**
   * Transitions the request to EXPIRED.
   */
  public markAsExpired(now: Date = new Date()): void {
    this._status = 'EXPIRED';
    this._updatedAt = now;
  }

  /**
   * Submits receipt proof for an INITIATED top-up request, transitioning it to PENDING.
   */
  public submitReceipt(
    fileId: string,
    caption?: string | null,
    now: Date = new Date()
  ): void {
    if (this._status !== 'INITIATED') {
      throw new Error(`Cannot submit receipt for request in status ${this._status}`);
    }

    if (this.isExpired(now)) {
      this.markAsExpired(now);
      throw new TopUpRequestExpiredError('The top-up request has expired.');
    }

    this._status = 'PENDING';
    this._receiptFileId = fileId;
    this._receiptCaption = caption?.trim() || null;
    this._updatedAt = now;
  }

  /**
   * Approves a PENDING top-up request.
   */
  public approve(adminTelegramId: bigint, now: Date = new Date()): void {
    if (this._status !== 'PENDING') {
      throw new TopUpRequestNotPendingError(
        'Top-up request is not pending approval or has already been processed.'
      );
    }

    this._status = 'APPROVED';
    this._processedByAdminTelegramId = adminTelegramId;
    this._processedAt = now;
    this._updatedAt = now;
  }

  /**
   * Rejects a PENDING top-up request.
   */
  public reject(
    adminTelegramId: bigint,
    rejectionReason: string,
    now: Date = new Date()
  ): void {
    if (this._status !== 'PENDING') {
      throw new TopUpRequestNotPendingError(
        'Top-up request is not pending approval or has already been processed.'
      );
    }

    this._status = 'REJECTED';
    this._rejectionReason = rejectionReason;
    this._processedByAdminTelegramId = adminTelegramId;
    this._processedAt = now;
    this._updatedAt = now;
  }

  /**
   * Cancels an INITIATED top-up request.
   * Throws CannotCancelPendingTopUpError if the request has already progressed to PENDING.
   */
  public cancel(now: Date = new Date()): void {
    if (this._status === 'PENDING') {
      throw new CannotCancelPendingTopUpError(
        'Cannot cancel top-up request after receipt has been submitted.'
      );
    }

    if (this._status !== 'INITIATED') {
      throw new Error(`Cannot cancel request in status ${this._status}`);
    }

    this._status = 'CANCELLED';
    this._updatedAt = now;
  }
}
