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
      findOriginalByOrderId: vi.fn(),
      updateReversedBy: vi.fn(),
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

  it('records order spend with BUYER_WALLET DEBIT and SYSTEM_CASH CREDIT', async () => {
    const mockCreatedTx = new LedgerTransaction({
      id: 'tx_spend_1',
      orderId: 'order_1',
      narrative: 'Order placement spend for order order_1',
      createdAt: new Date(),
    });

    const mockEntries = [
      new LedgerEntry({
        id: 'e1',
        ledgerTransactionId: 'tx_spend_1',
        accountType: 'BUYER_WALLET',
        direction: 'DEBIT',
        usdAmount: '25.00',
        walletId: 'w_1',
        createdAt: new Date(),
      }),
      new LedgerEntry({
        id: 'e2',
        ledgerTransactionId: 'tx_spend_1',
        accountType: 'SYSTEM_CASH',
        direction: 'CREDIT',
        usdAmount: '25.00',
        walletId: null,
        createdAt: new Date(),
      }),
    ];

    const mockLedgerRepo: ILedgerRepository<any> = {
      createTransactionWithEntries: vi.fn(async (params) => {
        expect(params.orderId).toBe('order_1');
        expect(params.entries[0]?.direction).toBe('DEBIT');
        expect(params.entries[0]?.accountType).toBe('BUYER_WALLET');
        expect(params.entries[1]?.direction).toBe('CREDIT');
        expect(params.entries[1]?.accountType).toBe('SYSTEM_CASH');
        return {
          transaction: mockCreatedTx,
          entries: mockEntries,
        };
      }),
      findOriginalByOrderId: vi.fn(),
      updateReversedBy: vi.fn(),
    };

    const service = new LedgerService(mockLedgerRepo);
    const result = await service.recordOrderSpend(
      {
        orderId: 'order_1',
        walletId: 'w_1',
        usdAmount: '25.00',
      },
      {} as any
    );

    expect(result.transaction.id).toBe('tx_spend_1');
    expect(mockLedgerRepo.createTransactionWithEntries).toHaveBeenCalledTimes(1);
  });

  it('records order refund with BUYER_WALLET CREDIT and SYSTEM_CASH DEBIT, and updates original tx reversed_by', async () => {
    const originalDebitTx = new LedgerTransaction({
      id: 'tx_original_debit',
      orderId: 'order_refund_1',
      narrative: 'Original spend',
      createdAt: new Date(),
    });

    const refundTx = new LedgerTransaction({
      id: 'tx_refund_1',
      orderId: 'order_refund_1',
      narrative: 'Order refund for order order_refund_1',
      createdAt: new Date(),
    });

    const mockEntries = [
      new LedgerEntry({
        id: 'e1',
        ledgerTransactionId: 'tx_refund_1',
        accountType: 'BUYER_WALLET',
        direction: 'CREDIT',
        usdAmount: '25.00',
        walletId: 'w_1',
        createdAt: new Date(),
      }),
      new LedgerEntry({
        id: 'e2',
        ledgerTransactionId: 'tx_refund_1',
        accountType: 'SYSTEM_CASH',
        direction: 'DEBIT',
        usdAmount: '25.00',
        walletId: null,
        createdAt: new Date(),
      }),
    ];

    const mockLedgerRepo: ILedgerRepository<any> = {
      createTransactionWithEntries: vi.fn(async (params) => {
        expect(params.orderId).toBe('order_refund_1');
        expect(params.entries[0]?.direction).toBe('CREDIT');
        expect(params.entries[0]?.accountType).toBe('BUYER_WALLET');
        expect(params.entries[1]?.direction).toBe('DEBIT');
        expect(params.entries[1]?.accountType).toBe('SYSTEM_CASH');
        return {
          transaction: refundTx,
          entries: mockEntries,
        };
      }),
      findOriginalByOrderId: vi.fn(async () => originalDebitTx),
      updateReversedBy: vi.fn(async () => {}),
    };

    const service = new LedgerService(mockLedgerRepo);
    const result = await service.recordOrderRefund(
      {
        orderId: 'order_refund_1',
        walletId: 'w_1',
        usdAmount: '25.00',
      },
      {} as any
    );

    expect(result.transaction.id).toBe('tx_refund_1');
    expect(result.originalTransactionId).toBe('tx_original_debit');
    expect(mockLedgerRepo.findOriginalByOrderId).toHaveBeenCalledWith(
      'order_refund_1',
      expect.anything()
    );
    expect(mockLedgerRepo.updateReversedBy).toHaveBeenCalledWith(
      'tx_original_debit',
      'tx_refund_1',
      expect.anything()
    );
  });
});

