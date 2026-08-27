import { describe, it, expect } from 'vitest';
import { LedgerTransaction } from '@/domain/ledger/ledger-transaction.entity';
import { UsdAmount } from '@/domain/shared/money.vo';

describe('LedgerTransaction Aggregate Entity', () => {
  it('validates balanced double-entry entries successfully', () => {
    expect(() =>
      LedgerTransaction.validateDoubleEntryBalance([
        { direction: 'DEBIT', usdAmount: new UsdAmount('100.00') },
        { direction: 'CREDIT', usdAmount: new UsdAmount('100.00') },
      ])
    ).not.toThrow();
  });

  it('throws when entries do not balance (sum DEBIT !== sum CREDIT)', () => {
    expect(() =>
      LedgerTransaction.validateDoubleEntryBalance([
        { direction: 'DEBIT', usdAmount: new UsdAmount('100.00') },
        { direction: 'CREDIT', usdAmount: new UsdAmount('99.99') },
      ])
    ).toThrow(/Ledger entries do not balance/i);
  });

  it('throws when less than 2 entries are provided', () => {
    expect(() =>
      LedgerTransaction.validateDoubleEntryBalance([
        { direction: 'DEBIT', usdAmount: new UsdAmount('100.00') },
      ])
    ).toThrow(/must have at least 2 entries/i);
  });
});
