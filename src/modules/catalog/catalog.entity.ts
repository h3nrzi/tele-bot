import { UsdAmount } from '@/core/shared/money.vo';

export interface CatalogItemProps {
  id: string;
  name: string;
  description: string | null;
  usdPrice: string | UsdAmount;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * CatalogItem Domain Entity.
 * Represents an Admin-configured purchasable item with a fixed USD price and optional description.
 */
export class CatalogItem {
  public readonly id: string;
  public readonly name: string;
  public readonly description: string | null;
  private readonly _usdPrice: UsdAmount;
  public readonly isActive: boolean;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(props: CatalogItemProps) {
    this.id = props.id;
    this.name = props.name;
    this.description = props.description;
    this._usdPrice =
      props.usdPrice instanceof UsdAmount
        ? props.usdPrice
        : new UsdAmount(props.usdPrice);
    this.isActive = props.isActive;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public get usdPrice(): string {
    return this._usdPrice.toFixed(2);
  }

  public get usdAmountVo(): UsdAmount {
    return this._usdPrice;
  }
}
