import { describe, it, expect } from 'vitest';
import { LedgerTransaction } from '@/modules/ledger/ledger-transaction.entity';
import { LedgerEntry } from '@/modules/ledger/ledger-entry.entity';
import { UsdAmount } from '@/core/shared/money.vo';

describe('Domain Entity: LedgerTransaction & LedgerEntry', () => {
  it('instantiates LedgerTransaction aggregate with props and entries', () => {
    const entry1 = new LedgerEntry({
      id: 'e1',
      ledgerTransactionId: 'tx1',
      accountType: 'SYSTEM_CASH',
      direction: 'DEBIT',
      usdAmount: '50.00',
      walletId: null,
      createdAt: new Date(),
    });

    const entry2 = new LedgerEntry({
      id: 'e2',
      ledgerTransactionId: 'tx1',
      accountType: 'BUYER_WALLET',
      direction: 'CREDIT',
      usdAmount: '50.00',
      walletId: 'w1',
      createdAt: new Date(),
    });

    const tx = new LedgerTransaction({
      id: 'tx1',
      topUpRequestId: 'topup-req-123',
      narrative: 'Top-up approval',
      createdAt: new Date(),
      entries: [entry1, entry2],
    });

    expect(tx.id).toBe('tx1');
    expect(tx.topUpRequestId).toBe('topup-req-123');
    expect(tx.narrative).toBe('Top-up approval');
    expect(tx.entries).toHaveLength(2);
    expect(tx.entries[0]!.accountType).toBe('SYSTEM_CASH');
    expect(tx.entries[1]!.accountType).toBe('BUYER_WALLET');
  });

  it('validates double entry balance: passes when sum(DEBIT) === sum(CREDIT)', () => {
    expect(() => {
      LedgerTransaction.validateDoubleEntryBalance([
        { direction: 'DEBIT', usdAmount: new UsdAmount('50.00') },
        { direction: 'CREDIT', usdAmount: new UsdAmount('50.00') },
      ]);
    }).not.toThrow();

    expect(() => {
      LedgerTransaction.validateDoubleEntryBalance([
        { direction: 'DEBIT', usdAmount: '123.45' },
        { direction: 'CREDIT', usdAmount: '123.45' },
      ]);
    }).not.toThrow();
  });

  it('throws error when entries are fewer than 2 or do not balance', () => {
    expect(() => {
      LedgerTransaction.validateDoubleEntryBalance([
        { direction: 'DEBIT', usdAmount: '50.00' },
      ]);
    }).toThrow('Ledger transaction must have at least 2 entries');

    expect(() => {
      LedgerTransaction.validateDoubleEntryBalance([
        { direction: 'DEBIT', usdAmount: '50.00' },
        { direction: 'CREDIT', usdAmount: '49.99' },
      ]);
    }).toThrow('Ledger entries do not balance');
  });
});
