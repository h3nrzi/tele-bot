import { injectable, inject } from 'tsyringe';
import type { DbExecutor } from '@/core/database/types';
import type {
  ILedgerRepository,
  CreateLedgerTransactionResult,
} from '@/modules/ledger/ledger.repository.interface';
import { TOKENS } from '@/core/di/tokens';
import { UsdAmount } from '@/core/shared/money.vo';

export interface RecordTopUpCreditParams {
  topUpRequestId: string;
  walletId: string;
  usdAmount: UsdAmount | string;
}

export interface RecordOrderSpendParams {
  orderId: string;
  walletId: string;
  usdAmount: UsdAmount | string;
}

export interface RecordOrderRefundParams {
  orderId: string;
  walletId: string;
  usdAmount: UsdAmount | string;
  narrative?: string | undefined;
}

export interface RecordOrderRefundResult extends CreateLedgerTransactionResult {
  originalTransactionId: string | null;
}

@injectable()
export class LedgerService {
  constructor(
    @inject(TOKENS.LedgerRepository)
    private readonly ledgerRepo: ILedgerRepository<DbExecutor>
  ) {}

  /**
   * Records a double-entry ledger transaction crediting a buyer wallet upon top-up approval:
   * - DEBIT SYSTEM_CASH
   * - CREDIT BUYER_WALLET
   */
  public async recordTopUpCredit(
    params: RecordTopUpCreditParams,
    executor: DbExecutor
  ): Promise<CreateLedgerTransactionResult> {
    return await this.ledgerRepo.createTransactionWithEntries(
      {
        topUpRequestId: params.topUpRequestId,
        narrative: `Top-up approval for request ${params.topUpRequestId}`,
        entries: [
          {
            accountType: 'SYSTEM_CASH',
            direction: 'DEBIT',
            usdAmount: params.usdAmount,
            walletId: null,
          },
          {
            accountType: 'BUYER_WALLET',
            direction: 'CREDIT',
            usdAmount: params.usdAmount,
            walletId: params.walletId,
          },
        ],
      },
      executor
    );
  }

  /**
   * Records a double-entry ledger transaction debiting a buyer wallet upon order placement:
   * - DEBIT BUYER_WALLET
   * - CREDIT SYSTEM_CASH
   */
  public async recordOrderSpend(
    params: RecordOrderSpendParams,
    executor: DbExecutor
  ): Promise<CreateLedgerTransactionResult> {
    return await this.ledgerRepo.createTransactionWithEntries(
      {
        orderId: params.orderId,
        narrative: `Order placement spend for order ${params.orderId}`,
        entries: [
          {
            accountType: 'BUYER_WALLET',
            direction: 'DEBIT',
            usdAmount: params.usdAmount,
            walletId: params.walletId,
          },
          {
            accountType: 'SYSTEM_CASH',
            direction: 'CREDIT',
            usdAmount: params.usdAmount,
            walletId: null,
          },
        ],
      },
      executor
    );
  }

  /**
   * Records a double-entry ledger transaction refunding a buyer wallet upon order rejection or cancellation:
   * - CREDIT BUYER_WALLET
   * - DEBIT SYSTEM_CASH
   * Links the original debit ledger transaction via reversed_by_ledger_transaction_id.
   */
  public async recordOrderRefund(
    params: RecordOrderRefundParams,
    executor: DbExecutor
  ): Promise<RecordOrderRefundResult> {
    // 1. Find original spend transaction for this order
    const originalTx = await this.ledgerRepo.findOriginalByOrderId(
      params.orderId,
      executor
    );

    // 2. Create refund transaction
    const refundResult = await this.ledgerRepo.createTransactionWithEntries(
      {
        orderId: params.orderId,
        narrative:
          params.narrative ?? `Order refund for order ${params.orderId}`,
        entries: [
          {
            accountType: 'BUYER_WALLET',
            direction: 'CREDIT',
            usdAmount: params.usdAmount,
            walletId: params.walletId,
          },
          {
            accountType: 'SYSTEM_CASH',
            direction: 'DEBIT',
            usdAmount: params.usdAmount,
            walletId: null,
          },
        ],
      },
      executor
    );

    // 3. Link original transaction to this refund
    if (originalTx) {
      await this.ledgerRepo.updateReversedBy(
        originalTx.id,
        refundResult.transaction.id,
        executor
      );
    }

    return {
      ...refundResult,
      originalTransactionId: originalTx ? originalTx.id : null,
    };
  }
}

