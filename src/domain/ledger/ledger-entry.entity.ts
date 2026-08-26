import { UsdAmount } from '../shared/money.vo';

export type LedgerAccountType = 'BUYER_WALLET' | 'SYSTEM_CASH';
export type LedgerEntryDirection = 'DEBIT' | 'CREDIT';

export interface LedgerEntryProps {
  id: string;
  ledgerTransactionId: string;
  accountType: LedgerAccountType;
  direction: LedgerEntryDirection;
  usdAmount: string | UsdAmount;
  walletId: string | null;
  createdAt: Date;
}

/**
 * LedgerEntry Domain Entity.
 * A single immutable entry in the double-entry accounting ledger.
 */
export class LedgerEntry {
  public readonly id: string;
  public readonly ledgerTransactionId: string;
  public readonly accountType: LedgerAccountType;
  public readonly direction: LedgerEntryDirection;
  public readonly usdAmount: UsdAmount;
  public readonly walletId: string | null;
  public readonly createdAt: Date;

  constructor(props: LedgerEntryProps) {
    this.id = props.id;
    this.ledgerTransactionId = props.ledgerTransactionId;
    this.accountType = props.accountType;
    this.direction = props.direction;
    this.usdAmount =
      props.usdAmount instanceof UsdAmount
        ? props.usdAmount
        : new UsdAmount(props.usdAmount);
    this.walletId = props.walletId;
    this.createdAt = props.createdAt;
  }
}
