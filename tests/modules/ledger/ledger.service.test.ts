import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { LedgerService } from '@/modules/ledger/ledger.service';
import type { ILedgerRepository, CreateLedgerTransactionParams } from '@/modules/ledger/ledger.repository.interface';
import { LedgerTransaction } from '@/modules/ledger/ledger-transaction.entity';
import { LedgerEntry } from '@/modules/ledger/ledger-entry.entity';

describe('LedgerService', () => {
  it('records top-up credit with balanced double-entry SYSTEM_CASH DEBIT and BUYER_WALLET CREDIT', async () => {
    const mockCreatedTx = new LedgerTransaction({
      id: 'tx_123',
      topUpRequestId: 'topup_456',
      narrative: 'Top-up approval for request topup_456',
      createdAt: new Date(),
    });

    const mockEntries = [
      new LedgerEntry({
        id: 'e1',
        ledgerTransactionId: 'tx_123',
        accountType: 'SYSTEM_CASH',
        direction: 'DEBIT',
        usdAmount: '100.00',
        walletId: null,
        createdAt: new Date(),
      }),
      new LedgerEntry({
        id: 'e2',
        ledgerTransactionId: 'tx_123',
        accountType: 'BUYER_WALLET',
        direction: 'CREDIT',
        usdAmount: '100.00',
        walletId: 'w_789',
        createdAt: new Date(),
      }),
    ];

    const mockLedgerRepo: ILedgerRepository<any> = {
      createTransactionWithEntries: vi.fn(async (params: CreateLedgerTransactionParams) => {
        expect(params.topUpRequestId).toBe('topup_456');
        expect(params.entries).toHaveLength(2);
        expect(params.entries[0]).toEqual({
          accountType: 'SYSTEM_CASH',
          direction: 'DEBIT',
          usdAmount: '100.00',
          walletId: null,
        });
        expect(params.entries[1]).toEqual({
          accountType: 'BUYER_WALLET',
          direction: 'CREDIT',
          usdAmount: '100.00',
          walletId: 'w_789',
        });
        return {
          transaction: mockCreatedTx,
          entries: mockEntries,
        };
      }),
    };

    const service = new LedgerService(mockLedgerRepo);
    const mockExecutor = {} as any;

    const result = await service.recordTopUpCredit(
      {
        topUpRequestId: 'topup_456',
        walletId: 'w_789',
        usdAmount: '100.00',
      },
      mockExecutor
    );

    expect(mockLedgerRepo.createTransactionWithEntries).toHaveBeenCalledTimes(1);
    expect(result.transaction.id).toBe('tx_123');
    expect(result.entries).toHaveLength(2);
  });
});
