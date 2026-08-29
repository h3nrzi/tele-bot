import { LedgerEntry } from '@/modules/ledger/ledger-entry.entity';
import { UsdAmount } from '@/core/shared/money.vo';
import {
  LedgerInsufficientEntriesError,
  LedgerUnbalancedEntriesError,
} from '@/modules/ledger/ledger.errors';

export interface LedgerTransactionProps {
  id: string;
  topUpRequestId: string | null;
  narrative: string;
  createdAt: Date;
  entries?: LedgerEntry[];
}

/**
 * LedgerTransaction Domain Aggregate.
 * Encapsulates an atomic double-entry event whose entries net to zero.
 */
export class LedgerTransaction {
  public readonly id: string;
  public readonly topUpRequestId: string | null;
  public readonly narrative: string;
  public readonly createdAt: Date;
  public readonly entries: LedgerEntry[];

  constructor(props: LedgerTransactionProps) {
    this.id = props.id;
    this.topUpRequestId = props.topUpRequestId;
    this.narrative = props.narrative;
    this.createdAt = props.createdAt;
    this.entries = props.entries ?? [];
  }

  /**
   * Asserts the double-entry accounting invariant: sum(DEBIT) === sum(CREDIT).
   */
  public static validateDoubleEntryBalance(
    entries: Array<{ direction: 'DEBIT' | 'CREDIT'; usdAmount: UsdAmount | string }>
  ): void {
    if (entries.length < 2) {
      throw new LedgerInsufficientEntriesError();
    }

    let totalDebit = UsdAmount.zero();
    let totalCredit = UsdAmount.zero();

    for (const entry of entries) {
      const amount = entry.usdAmount instanceof UsdAmount ? entry.usdAmount : new UsdAmount(entry.usdAmount);
      if (entry.direction === 'DEBIT') {
        totalDebit = totalDebit.plus(amount);
      } else if (entry.direction === 'CREDIT') {
        totalCredit = totalCredit.plus(amount);
      }
    }

    if (!totalDebit.equals(totalCredit)) {
      throw new LedgerUnbalancedEntriesError(
        `Ledger entries do not balance: totalDebit=${totalDebit.toString()}, totalCredit=${totalCredit.toString()}`
      );
    }
  }
}
