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
}
