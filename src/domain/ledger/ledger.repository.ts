import type { LedgerTransaction } from '@/domain/ledger/ledger-transaction.entity';
import type { LedgerEntry, LedgerAccountType, LedgerEntryDirection } from '@/domain/ledger/ledger-entry.entity';
import type { UsdAmount } from '@/domain/shared/money.vo';

export interface CreateLedgerEntryParams {
  accountType: LedgerAccountType;
  direction: LedgerEntryDirection;
  usdAmount: UsdAmount | string;
  walletId?: string | null;
}

export interface CreateLedgerTransactionParams {
  topUpRequestId?: string | null;
  narrative: string;
  entries: CreateLedgerEntryParams[];
}

export interface CreateLedgerTransactionResult {
  transaction: LedgerTransaction;
  entries: LedgerEntry[];
}

/**
 * Domain Repository Interface for Ledger.
 */
export interface ILedgerRepository<TExecutor = unknown> {
  createTransactionWithEntries(
    params: CreateLedgerTransactionParams,
    executor: TExecutor
  ): Promise<CreateLedgerTransactionResult>;
}
