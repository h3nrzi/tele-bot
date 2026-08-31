import { injectable } from 'tsyringe';
import { ledgerTransactions, ledgerEntries } from '@/modules/ledger/ledger.schema';
import type { DbExecutor } from '@/core/database/types';
import { LedgerTransaction } from '@/modules/ledger/ledger-transaction.entity';
import { LedgerEntry } from '@/modules/ledger/ledger-entry.entity';
import type {
  ILedgerRepository,
  CreateLedgerTransactionParams,
  CreateLedgerTransactionResult,
} from '@/modules/ledger/ledger.repository.interface';
import { UsdAmount } from '@/core/shared/money.vo';

@injectable()
export class DrizzleLedgerRepository
  implements ILedgerRepository<DbExecutor>
{
  public async createTransactionWithEntries(
    params: CreateLedgerTransactionParams,
    executor: DbExecutor
  ): Promise<CreateLedgerTransactionResult> {
    // 1. Invariant check on double-entry balance
    LedgerTransaction.validateDoubleEntryBalance(params.entries);

    // 2. Insert transaction
    const [txRow] = await executor
      .insert(ledgerTransactions)
      .values({
        topUpRequestId: params.topUpRequestId ?? null,
        orderId: params.orderId ?? null,
        reversedByLedgerTransactionId:
          params.reversedByLedgerTransactionId ?? null,
        narrative: params.narrative,
      })
      .returning();

    if (!txRow) {
      throw new Error('Failed to create ledger transaction');
    }

    // 3. Insert entries
    const valuesToInsert = params.entries.map((entry) => ({
      ledgerTransactionId: txRow.id,
      accountType: entry.accountType,
      direction: entry.direction,
      usdAmount:
        entry.usdAmount instanceof UsdAmount
          ? entry.usdAmount.toString()
          : entry.usdAmount,
      walletId: entry.walletId ?? null,
    }));

    const entryRows = await executor
      .insert(ledgerEntries)
      .values(valuesToInsert)
      .returning();

    if (entryRows.length !== params.entries.length) {
      throw new Error('Failed to insert all ledger entries');
    }

    const domainEntries = entryRows.map(
      (r) =>
        new LedgerEntry({
          id: r.id,
          ledgerTransactionId: r.ledgerTransactionId,
          accountType: r.accountType,
          direction: r.direction,
          usdAmount: r.usdAmount,
          walletId: r.walletId,
          createdAt: r.createdAt,
        })
    );

    const domainTx = new LedgerTransaction({
      id: txRow.id,
      topUpRequestId: txRow.topUpRequestId,
      orderId: txRow.orderId,
      reversedByLedgerTransactionId: txRow.reversedByLedgerTransactionId,
      narrative: txRow.narrative,
      createdAt: txRow.createdAt,
      entries: domainEntries,
    });

    return {
      transaction: domainTx,
      entries: domainEntries,
    };
  }
}

export const LedgerRepository = DrizzleLedgerRepository;

