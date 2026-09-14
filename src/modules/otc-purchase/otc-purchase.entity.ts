import { UsdAmount } from '@/core/shared/money.vo';
import { InvalidOtcPurchaseStateError } from '@/modules/otc-purchase/otc-purchase.errors';

export type OtcPurchaseStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

export interface OtcPurchaseProps {
  id: string;
  topUpRequestId: string;
  usdtQuantity: string | number | UsdAmount;
  status: OtcPurchaseStatus;
  wallexClientOrderId?: string | null;
  wallexExecutedPrice?: bigint | number | null;
  wallexExecutedQty?: string | number | null;
  wallexExecutedSum?: bigint | number | null;
  wallexFee?: bigint | number | null;
  errorMessage?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompleteOtcPurchaseParams {
  wallexClientOrderId: string;
  wallexExecutedPrice: bigint | number;
  wallexExecutedQty: string | number;
  wallexExecutedSum: bigint | number;
  wallexFee: bigint | number;
}

/**
 * OtcPurchase Domain Entity.
 * Encapsulates the execution lifecycle and audit trail of automated Wallex OTC purchases
 * triggered after a Top-Up Request approval.
 */
export class OtcPurchase {
  public readonly id: string;
  public readonly topUpRequestId: string;
  private readonly _usdtQuantity: UsdAmount;
  private _status: OtcPurchaseStatus;
  private _wallexClientOrderId: string | null;
  private _wallexExecutedPrice: bigint | null;
  private _wallexExecutedQty: string | null;
  private _wallexExecutedSum: bigint | null;
  private _wallexFee: bigint | null;
  private _errorMessage: string | null;
  public readonly createdAt: Date;
  private _updatedAt: Date;

  constructor(props: OtcPurchaseProps) {
    this.id = props.id;
    this.topUpRequestId = props.topUpRequestId;
    this._usdtQuantity =
      props.usdtQuantity instanceof UsdAmount
        ? props.usdtQuantity
        : new UsdAmount(props.usdtQuantity);
    this._status = props.status;
    this._wallexClientOrderId = props.wallexClientOrderId ?? null;
    this._wallexExecutedPrice =
      props.wallexExecutedPrice !== undefined && props.wallexExecutedPrice !== null
        ? BigInt(props.wallexExecutedPrice)
        : null;
    this._wallexExecutedQty =
      props.wallexExecutedQty !== undefined && props.wallexExecutedQty !== null
        ? String(props.wallexExecutedQty)
        : null;
    this._wallexExecutedSum =
      props.wallexExecutedSum !== undefined && props.wallexExecutedSum !== null
        ? BigInt(props.wallexExecutedSum)
        : null;
    this._wallexFee =
      props.wallexFee !== undefined && props.wallexFee !== null
        ? BigInt(props.wallexFee)
        : null;
    this._errorMessage = props.errorMessage ?? null;
    this.createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  public get usdtQuantity(): string {
    return this._usdtQuantity.toFixed(2);
  }

  public get usdtQuantityVo(): UsdAmount {
    return this._usdtQuantity;
  }

  public get status(): OtcPurchaseStatus {
    return this._status;
  }

  public get wallexClientOrderId(): string | null {
    return this._wallexClientOrderId;
  }

  public get wallexExecutedPrice(): bigint | null {
    return this._wallexExecutedPrice;
  }

  public get wallexExecutedQty(): string | null {
    return this._wallexExecutedQty;
  }

  public get wallexExecutedSum(): bigint | null {
    return this._wallexExecutedSum;
  }

  public get wallexFee(): bigint | null {
    return this._wallexFee;
  }

  public get errorMessage(): string | null {
    return this._errorMessage;
  }

  public get updatedAt(): Date {
    return this._updatedAt;
  }

  public isPending(): boolean {
    return this._status === 'PENDING';
  }

  public isCompleted(): boolean {
    return this._status === 'COMPLETED';
  }

  public isFailed(): boolean {
    return this._status === 'FAILED';
  }

  public complete(params: CompleteOtcPurchaseParams, now: Date = new Date()): void {
    if (this._status !== 'PENDING') {
      throw new InvalidOtcPurchaseStateError(
        `Cannot complete OTC purchase in status ${this._status}`
      );
    }
    this._status = 'COMPLETED';
    this._wallexClientOrderId = params.wallexClientOrderId;
    this._wallexExecutedPrice = BigInt(params.wallexExecutedPrice);
    this._wallexExecutedQty = String(params.wallexExecutedQty);
    this._wallexExecutedSum = BigInt(params.wallexExecutedSum);
    this._wallexFee = BigInt(params.wallexFee);
    this._errorMessage = null;
    this._updatedAt = now;
  }

  public fail(errorMessage: string, now: Date = new Date()): void {
    if (this._status !== 'PENDING') {
      throw new InvalidOtcPurchaseStateError(
        `Cannot fail OTC purchase in status ${this._status}`
      );
    }
    this._status = 'FAILED';
    this._errorMessage = errorMessage;
    this._updatedAt = now;
  }
}
