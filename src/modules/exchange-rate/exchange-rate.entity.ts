import { IrrAmount, UsdAmount } from '@/core/shared/money.vo';

export interface ExchangeRateProps {
  id: string;
  irrPerUsd: bigint | number;
  createdByAdminTelegramId: bigint;
  createdAt: Date;
}

/**
 * ExchangeRate Domain Entity.
 * Represents an append-only historical snapshot of the USD -> IRR conversion rate.
 */
export class ExchangeRate {
  public readonly id: string;
  public readonly irrPerUsd: bigint;
  public readonly createdByAdminTelegramId: bigint;
  public readonly createdAt: Date;

  constructor(props: ExchangeRateProps) {
    this.id = props.id;
    this.irrPerUsd = typeof props.irrPerUsd === 'bigint' ? props.irrPerUsd : BigInt(props.irrPerUsd);
    this.createdByAdminTelegramId = props.createdByAdminTelegramId;
    this.createdAt = props.createdAt;
  }

  /**
   * Converts a USD amount to IRR using this exchange rate: round(usd * irrPerUsd).
   */
  public convertUsdToIrr(usdAmount: UsdAmount | string): IrrAmount {
    const usd = usdAmount instanceof UsdAmount ? usdAmount : new UsdAmount(usdAmount);
    const computed = usd.toDecimal().times(this.irrPerUsd.toString()).round();
    return new IrrAmount(computed);
  }

  public formatRate(): string {
    return new IrrAmount(this.irrPerUsd).format();
  }
}
