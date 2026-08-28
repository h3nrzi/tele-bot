import { injectable, inject } from 'tsyringe';
import type { DbClient } from '@/core/database/client';
import { getDefaultDb } from '@/core/database/client';
import type { DbExecutor } from '@/core/database/types';
import type { ITopUpRequestRepository } from '@/modules/top-up/top-up.repository.interface';
import type { IExchangeRateRepository } from '@/modules/exchange-rate/exchange-rate.repository.interface';
import type { IBuyerRepository } from '@/modules/buyer/buyer.repository.interface';
import type { IWalletRepository } from '@/modules/wallet/wallet.repository.interface';
import type { ILedgerRepository } from '@/modules/ledger/ledger.repository.interface';
import { TopUpLimits } from '@/modules/top-up/top-up.limits.vo';
import { TopUpRequest } from '@/modules/top-up/top-up-request.entity';
import {
  ActiveTopUpRequestExistsError,
  InvalidTopUpAmountError,
  NoInitiatedTopUpRequestError,
  TopUpRequestExpiredError,
  TopUpRequestNotFoundError,
  NoActiveTopUpRequestError,
} from '@/modules/top-up/top-up.errors';
import { NoExchangeRateError } from '@/modules/exchange-rate/exchange-rate.errors';
import { WalletNotFoundError } from '@/modules/wallet/wallet.errors';
import { normalizeChatId } from '@/core/shared/telegram.utils';
import type {
  InitiateTopUpInput,
  InitiateTopUpResult,
  SubmitReceiptInput,
  SubmitReceiptOptions,
  SubmitReceiptResult,
  ApproveTopUpInput,
  ApproveTopUpDependencies,
  ApproveTopUpResult,
  RejectTopUpInput,
  RejectTopUpDependencies,
  RejectTopUpResult,
  CancelTopUpInput,
  CancelTopUpOptions,
  CancelTopUpResult,
  PendingTopUpRequestItem,
} from '@/modules/top-up/dtos/top-up.dto';
import { TOKENS } from '@/core/di/tokens';

@injectable()
export class TopUpService {
  constructor(
    @inject(TOKENS.DbClient) private readonly db: DbClient,
    @inject(TOKENS.TopUpRepository)
    private readonly topUpRepo: ITopUpRequestRepository<DbExecutor>,
    @inject(TOKENS.ExchangeRateRepository)
    private readonly exchangeRateRepo: IExchangeRateRepository<DbExecutor>,
    @inject(TOKENS.BuyerRepository)
    private readonly buyerRepo: IBuyerRepository<DbExecutor>,
    @inject(TOKENS.WalletRepository)
    private readonly walletRepo: IWalletRepository<DbExecutor>,
    @inject(TOKENS.LedgerRepository)
    private readonly ledgerRepo: ILedgerRepository<DbExecutor>,
    @inject(TOKENS.TopUpLimits)
    private readonly topUpLimits?: TopUpLimits
  ) {}

  /**
   * Initiates a new Top-Up Request for a Buyer.
   */
  public async initiateTopUp(
    input: InitiateTopUpInput,
    customLimits?: TopUpLimits,
    executor?: DbExecutor
  ): Promise<InitiateTopUpResult> {
    const client = executor ?? this.db ?? getDefaultDb();
    const limits = customLimits ?? this.topUpLimits ?? TopUpLimits.fromEnv();

    // 1. Validate Amount
    const validation = limits.validateAmount(input.usdAmount);
    if (!validation.valid) {
      throw new InvalidTopUpAmountError(validation.message);
    }

    // 2. Fetch Active Exchange Rate
    const currentRate = await this.exchangeRateRepo.findLatest(client);
    if (!currentRate) {
      throw new NoExchangeRateError(
        'No active exchange rate found. Top-up is temporarily unavailable.'
      );
    }

    // 3. Compute IRR Amount
    const irrAmount = currentRate.convertUsdToIrr(validation.amount);

    // 4. Calculate expires_at
    const expiresAt = limits.calculateExpiryDate();

    // 5. Insert Top-Up Request
    try {
      const insertedRequest = await this.topUpRepo.insert(
        {
          userId: input.userId,
          exchangeRateId: currentRate.id,
          usdAmount: validation.amount,
          irrAmount,
          status: 'INITIATED',
          expiresAt,
        },
        client
      );

      return {
        request: insertedRequest,
        exchangeRate: currentRate,
      };
    } catch (err: any) {
      if (
        err?.code === '23505' &&
        (err?.constraint?.includes('top_up_requests_user_id_active_idx') ||
          err?.detail?.includes('top_up_requests') ||
          err?.message?.includes('top_up_requests_user_id_active_idx') ||
          err?.message?.includes('duplicate key value'))
      ) {
        throw new ActiveTopUpRequestExistsError(
          'You already have an active top-up request.'
        );
      }
      throw err;
    }
  }

  /**
   * Returns the currently active top-up request (INITIATED or PENDING) for a user, or null if none.
   */
  public async getActiveTopUpRequest(
    userId: string,
    executor?: DbExecutor
  ): Promise<TopUpRequest | null> {
    const client = executor ?? this.db ?? getDefaultDb();
    return await this.topUpRepo.findActiveByUserId(userId, client);
  }

  /**
   * Submits a receipt for a Buyer's active INITIATED Top-Up Request.
   */
  public async submitReceipt(
    input: SubmitReceiptInput,
    options?: SubmitReceiptOptions,
    executor?: DbExecutor
  ): Promise<SubmitReceiptResult> {
    const client = executor ?? this.db ?? getDefaultDb();
    const now = options?.now ?? new Date();

    // 1. Fetch active INITIATED request
    const initiatedRequest = await this.topUpRepo.findInitiatedByUserId(
      input.userId,
      client
    );

    if (!initiatedRequest) {
      throw new NoInitiatedTopUpRequestError(
        'No active initiated top-up request found.'
      );
    }

    // 2. Aggregate state transition
    try {
      initiatedRequest.submitReceipt(input.fileId, input.caption, now);
    } catch (err) {
      if (err instanceof TopUpRequestExpiredError) {
        await this.topUpRepo.updateStatus(
          initiatedRequest.id,
          'EXPIRED',
          { updatedAt: now },
          client
        );
      }
      throw err;
    }

    // 3. Persist PENDING update
    const updatedRequest = await this.topUpRepo.updateStatus(
      initiatedRequest.id,
      'PENDING',
      {
        receiptFileId: initiatedRequest.receiptFileId,
        receiptCaption: initiatedRequest.receiptCaption,
        updatedAt: initiatedRequest.updatedAt,
      },
      client
    );

    if (!updatedRequest) {
      throw new NoInitiatedTopUpRequestError('Top-up request is no longer initiated.');
    }

    return {
      request: updatedRequest,
    };
  }

  /**
   * Approves a pending Top-Up Request inside a single atomic transaction.
   */
  public async approveTopUp(
    input: ApproveTopUpInput,
    dependencies?: ApproveTopUpDependencies,
    executor?: DbExecutor
  ): Promise<ApproveTopUpResult> {
    const client = (executor ?? this.db ?? getDefaultDb()) as DbClient;
    const adminId = normalizeChatId(input.adminTelegramId);
    const now = new Date();

    const executeApproval = async (tx: DbExecutor): Promise<ApproveTopUpResult> => {
      // 1. SELECT top_up_request FOR UPDATE
      const request = await this.topUpRepo.findByIdForUpdate(
        input.topUpRequestId,
        tx
      );

      if (!request) {
        throw new TopUpRequestNotFoundError('Top-up request not found.');
      }

      // 2. Domain state transition
      request.approve(adminId, now);

      // 3. Fetch Buyer
      const buyer = await this.buyerRepo.findById(request.userId, tx);
      if (!buyer) {
        throw new Error('Buyer record not found for top-up request.');
      }

      // 4. SELECT wallet FOR UPDATE
      const wallet = await this.walletRepo.findByUserIdForUpdate(
        request.userId,
        tx
      );

      if (!wallet) {
        throw new WalletNotFoundError('Buyer wallet not found.');
      }

      // 5. Domain wallet credit
      wallet.credit(request.usdAmount);

      // 6. Create Ledger Transaction and double-entry rows
      const { transaction: ledgerTx, entries } =
        await this.ledgerRepo.createTransactionWithEntries(
          {
            topUpRequestId: request.id,
            narrative: `Top-up approval for request ${request.id}`,
            entries: [
              {
                accountType: 'SYSTEM_CASH',
                direction: 'DEBIT',
                usdAmount: request.usdAmount,
                walletId: null,
              },
              {
                accountType: 'BUYER_WALLET',
                direction: 'CREDIT',
                usdAmount: request.usdAmount,
                walletId: wallet.id,
              },
            ],
          },
          tx
        );

      // 7. Update wallet available_balance
      const updatedWallet = await this.walletRepo.updateBalance(
        wallet.id,
        wallet.availableBalance,
        tx
      );

      // 8. Update top_up_requests status to APPROVED
      const updatedRequest = await this.topUpRepo.updateStatus(
        request.id,
        'APPROVED',
        {
          processedByAdminTelegramId: adminId,
          processedAt: request.processedAt,
          updatedAt: request.updatedAt,
        },
        tx
      );

      if (!updatedRequest) {
        throw new Error('Failed to update top-up request status.');
      }

      return {
        request: updatedRequest,
        wallet: updatedWallet,
        ledgerTransaction: ledgerTx,
        ledgerEntries: entries as [typeof entries[0], typeof entries[1]],
        buyerChatId: buyer.telegramChatId,
      };
    };

    let txResult: ApproveTopUpResult;
    if ('transaction' in client && typeof client.transaction === 'function') {
      txResult = await client.transaction(async (tx) => {
        return await executeApproval(tx);
      });
    } else {
      txResult = await executeApproval(client);
    }

    // Post-commit notification
    if (dependencies?.notifyBuyer) {
      try {
        await dependencies.notifyBuyer({
          buyerTelegramChatId: txResult.buyerChatId,
          creditedUsdAmount: txResult.request.usdAmount.toString(),
          newAvailableBalance: txResult.wallet.availableBalance,
        });
      } catch (notifyErr) {
        console.error(
          `Failed to send buyer push notification to ${txResult.buyerChatId}:`,
          notifyErr
        );
      }
    }

    return txResult;
  }

  /**
   * Rejects a pending Top-Up Request inside a single atomic transaction.
   */
  public async rejectTopUp(
    input: RejectTopUpInput,
    dependencies?: RejectTopUpDependencies,
    executor?: DbExecutor
  ): Promise<RejectTopUpResult> {
    const client = (executor ?? this.db ?? getDefaultDb()) as DbClient;
    const adminId = normalizeChatId(input.adminTelegramId);
    const now = new Date();

    const executeRejection = async (tx: DbExecutor): Promise<RejectTopUpResult> => {
      // 1. SELECT top_up_request FOR UPDATE
      const request = await this.topUpRepo.findByIdForUpdate(
        input.topUpRequestId,
        tx
      );

      if (!request) {
        throw new TopUpRequestNotFoundError('Top-up request not found.');
      }

      // 2. Domain state transition (asserts status = 'PENDING')
      request.reject(adminId, input.rejectionReason, now);

      // 3. Fetch Buyer
      const buyer = await this.buyerRepo.findById(request.userId, tx);
      if (!buyer) {
        throw new Error('Buyer record not found for top-up request.');
      }

      // 4. Update top_up_requests status to REJECTED in DB
      const updatedRequest = await this.topUpRepo.updateStatus(
        request.id,
        'REJECTED',
        {
          rejectionReason: request.rejectionReason,
          processedByAdminTelegramId: adminId,
          processedAt: request.processedAt,
          updatedAt: request.updatedAt,
        },
        tx
      );

      if (!updatedRequest) {
        throw new Error('Failed to update top-up request status.');
      }

      return {
        request: updatedRequest,
        buyerChatId: buyer.telegramChatId,
      };
    };

    let txResult: RejectTopUpResult;
    if ('transaction' in client && typeof client.transaction === 'function') {
      txResult = await client.transaction(async (tx) => {
        return await executeRejection(tx);
      });
    } else {
      txResult = await executeRejection(client);
    }

    // Post-commit notification
    if (dependencies?.notifyBuyer) {
      try {
        await dependencies.notifyBuyer({
          buyerTelegramChatId: txResult.buyerChatId,
          rejectionReason: input.rejectionReason,
        });
      } catch (notifyErr) {
        console.error(
          `Failed to send buyer rejection push notification to ${txResult.buyerChatId}:`,
          notifyErr
        );
      }
    }

    return txResult;
  }

  /**
   * Cancels an active INITIATED Top-Up Request for a Buyer.
   */
  public async cancelTopUp(
    input: CancelTopUpInput,
    options?: CancelTopUpOptions,
    executor?: DbExecutor
  ): Promise<CancelTopUpResult> {
    const client = executor ?? this.db ?? getDefaultDb();
    const now = options?.now ?? new Date();

    // 1. Fetch active request
    const activeRequest = await this.topUpRepo.findActiveByUserId(
      input.userId,
      client
    );

    if (!activeRequest) {
      throw new NoActiveTopUpRequestError('No active top-up request found to cancel.');
    }

    // 2. Aggregate domain validation & transition
    activeRequest.cancel(now);

    // 3. Persist CANCELLED update
    const updatedRequest = await this.topUpRepo.updateStatus(
      activeRequest.id,
      'CANCELLED',
      {
        updatedAt: activeRequest.updatedAt,
      },
      client
    );

    if (!updatedRequest) {
      throw new NoActiveTopUpRequestError('Top-up request no longer exists.');
    }

    return {
      request: updatedRequest,
    };
  }

  /**
   * Returns the most recent top-up request for a Buyer regardless of status, or null if none exists.
   */
  public async getLatestTopUpRequest(
    userId: string,
    executor?: DbExecutor
  ): Promise<TopUpRequest | null> {
    const client = executor ?? this.db ?? getDefaultDb();
    return await this.topUpRepo.findLatestByUserId(userId, client);
  }

  /**
   * Returns all top-up requests in PENDING status, ordered by created_at ascending.
   */
  public async getPendingRequests(
    executor?: DbExecutor
  ): Promise<PendingTopUpRequestItem[]> {
    const client = executor ?? this.db ?? getDefaultDb();
    return await this.topUpRepo.findPendingWithBuyer(client);
  }

  /**
   * Returns a top-up request with joined buyer details by ID, or null if not found.
   */
  public async getPendingRequestById(
    id: string,
    executor?: DbExecutor
  ): Promise<PendingTopUpRequestItem | null> {
    const client = executor ?? this.db ?? getDefaultDb();
    return await this.topUpRepo.findByIdWithBuyer(id, client);
  }
}
