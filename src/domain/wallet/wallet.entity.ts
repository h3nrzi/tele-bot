import { UsdAmount } from '@/domain/shared/money.vo';

export interface WalletProps {
  id: string;
  userId: string;
  availableBalance: string | UsdAmount;
  updatedAt: Date;
}

/**
 * Wallet Domain Aggregate.
 * Enforces available balance invariants using exact USD arithmetic.
 */
export class Wallet {
  public readonly id: string;
  public readonly userId: string;
  private _availableBalance: UsdAmount;
  private _updatedAt: Date;

  constructor(props: WalletProps) {
    this.id = props.id;
    this.userId = props.userId;
    this._availableBalance =
      props.availableBalance instanceof UsdAmount
        ? props.availableBalance
        : new UsdAmount(props.availableBalance);
    this._updatedAt = props.updatedAt;
  }

  public get availableBalance(): string {
    return this._availableBalance.toFixed(2);
  }

  public get availableBalanceVo(): UsdAmount {
    return this._availableBalance;
  }

  public get updatedAt(): Date {
    return this._updatedAt;
  }

  /**
   * Credits the wallet with a USD amount and returns the updated new balance.
   */
  public credit(amount: UsdAmount | string): UsdAmount {
    const usdAmount = amount instanceof UsdAmount ? amount : new UsdAmount(amount);
    if (!usdAmount.isPositive()) {
      throw new Error('Credit amount must be positive.');
    }
    this._availableBalance = this._availableBalance.plus(usdAmount);
    this._updatedAt = new Date();
    return this._availableBalance;
  }

  /**
   * Checks if the wallet has at least the required amount.
   */
  public hasSufficientBalance(amount: UsdAmount | string): boolean {
    const required = amount instanceof UsdAmount ? amount : new UsdAmount(amount);
    return this._availableBalance.gte(required);
  }
}
