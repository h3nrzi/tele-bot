import type { DbClient } from '../../db/client';
import { getDefaultDb } from '../../db/client';
import { topUpRequestRepository } from '../../infrastructure/repositories/drizzle-top-up-request.repository';
import { exchangeRateRepository } from '../../infrastructure/repositories/drizzle-exchange-rate.repository';
import { buyerRepository } from '../../infrastructure/repositories/drizzle-buyer.repository';
import { walletRepository } from '../../infrastructure/repositories/drizzle-wallet.repository';
import { ledgerRepository } from '../../infrastructure/repositories/drizzle-ledger.repository';
import { TopUpLimits } from '../../domain/top-up/top-up.limits.vo';
import { TopUpRequest } from '../../domain/top-up/top-up-request.entity';
import {
  ActiveTopUpRequestExistsError,
  InvalidTopUpAmountError,
  NoInitiatedTopUpRequestError,
  TopUpRequestExpiredError,
  TopUpRequestNotFoundError,
  TopUpRequestNotPendingError,
  CannotCancelPendingTopUpError,
  NoActiveTopUpRequestError,
} from '../../domain/top-up/top-up.errors';
import { NoExchangeRateError } from '../../domain/exchange-rate/exchange-rate.errors';
import { WalletNotFoundError } from '../../domain/wallet/wallet.errors';
import { normalizeChatId } from '../../utils/telegram';
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
} from './dtos/top-up.dto';

/**
 * Initiates a new Top-Up Request for a Buyer:
 * 1. Validates amount bounds against configured TopUpLimits.
 * 2. Fetches active exchange rate; throws NoExchangeRateError if none exists.
 * 3. Computes the exact irr_amount as round(usd_amount * irr_per_usd).
 * 4. Sets expires_at = now() + expiryMinutes.
 * 5. Inserts the row into top_up_requests with status 'INITIATED'.
 */
export async function initiateTopUp(
  input: InitiateTopUpInput,
  dbClient?: DbClient,
  customLimits?: TopUpLimits
): Promise<InitiateTopUpResult> {
  const client = dbClient ?? getDefaultDb();
  const limits = customLimits ?? TopUpLimits.fromEnv();

  // 1. Validate Amount
  const validation = limits.validateAmount(input.usdAmount);
  if (!validation.valid) {
    throw new InvalidTopUpAmountError(validation.message);
  }

  // 2. Fetch Active Exchange Rate
  const currentRate = await exchangeRateRepository.findLatest(client);
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
    const insertedRequest = await topUpRequestRepository.insert(
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
export async function getActiveTopUpRequest(
  userId: string,
  dbClient?: DbClient
): Promise<TopUpRequest | null> {
  const client = dbClient ?? getDefaultDb();
  return await topUpRequestRepository.findActiveByUserId(userId, client);
}

/**
 * Submits a receipt for a Buyer's active INITIATED Top-Up Request:
 * 1. Fetches the Buyer's active INITIATED request. Throws NoInitiatedTopUpRequestError if none.
 * 2. Checks expiry on the domain entity. If expired, updates status to 'EXPIRED' and throws TopUpRequestExpiredError.
 * 3. Updates status to 'PENDING', sets receipt_file_id and receipt_caption.
 */
export async function submitReceipt(
  input: SubmitReceiptInput,
  dbClient?: DbClient,
  options?: SubmitReceiptOptions
): Promise<SubmitReceiptResult> {
  const client = dbClient ?? getDefaultDb();
  const now = options?.now ?? new Date();

  // 1. Fetch active INITIATED request
  const initiatedRequest = await topUpRequestRepository.findInitiatedByUserId(
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
      await topUpRequestRepository.updateStatus(
        initiatedRequest.id,
        'EXPIRED',
        { updatedAt: now },
        client
      );
    }
    throw err;
  }

  // 3. Persist PENDING update
  const updatedRequest = await topUpRequestRepository.updateStatus(
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
 * Approves a pending Top-Up Request inside a single atomic PostgreSQL transaction:
 * 1. SELECT top_up_requests FOR UPDATE
 * 2. Assert status = 'PENDING' via domain entity method
 * 3. SELECT users and wallets FOR UPDATE
 * 4. Credit wallet via domain method
 * 5. Create double-entry ledger transaction and entries
 * 6. Update wallet balance and top-up request status in DB
 * 7. Dispatches notifyBuyer post-commit.
 */
export async function approveTopUp(
  input: ApproveTopUpInput,
  dbClient?: DbClient,
  dependencies?: ApproveTopUpDependencies
): Promise<ApproveTopUpResult> {
  const client = dbClient ?? getDefaultDb();
  const adminId = normalizeChatId(input.adminTelegramId);
  const now = new Date();

  const txResult = await client.transaction(async (tx) => {
    // 1. SELECT top_up_request FOR UPDATE
    const request = await topUpRequestRepository.findByIdForUpdate(
      input.topUpRequestId,
      tx
    );

    if (!request) {
      throw new TopUpRequestNotFoundError('Top-up request not found.');
    }

    // 2. Domain state transition
    request.approve(adminId, now);

    // 3. Fetch Buyer
    const buyer = await buyerRepository.findById(request.userId, tx);
    if (!buyer) {
      throw new Error('Buyer record not found for top-up request.');
    }

    // 4. SELECT wallet FOR UPDATE
    const wallet = await walletRepository.findByUserIdForUpdate(
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
      await ledgerRepository.createTransactionWithEntries(
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
    const updatedWallet = await walletRepository.updateBalance(
      wallet.id,
      wallet.availableBalance,
      tx
    );

    // 8. Update top_up_requests status to APPROVED
    const updatedRequest = await topUpRequestRepository.updateStatus(
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
  });

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
 * Rejects a pending Top-Up Request inside a single atomic PostgreSQL transaction:
 * 1. SELECT top_up_requests FOR UPDATE
 * 2. Assert status = 'PENDING' via domain entity method
 * 3. Update top_up_requests status to REJECTED and save rejection_reason, processed_by_admin_telegram_id, processed_at
 * 4. Dispatches notifyBuyer post-commit.
 */
export async function rejectTopUp(
  input: RejectTopUpInput,
  dbClient?: DbClient,
  dependencies?: RejectTopUpDependencies
): Promise<RejectTopUpResult> {
  const client = dbClient ?? getDefaultDb();
  const adminId = normalizeChatId(input.adminTelegramId);
  const now = new Date();

  const txResult = await client.transaction(async (tx) => {
    // 1. SELECT top_up_request FOR UPDATE
    const request = await topUpRequestRepository.findByIdForUpdate(
      input.topUpRequestId,
      tx
    );

    if (!request) {
      throw new TopUpRequestNotFoundError('Top-up request not found.');
    }

    // 2. Domain state transition (asserts status = 'PENDING')
    request.reject(adminId, input.rejectionReason, now);

    // 3. Fetch Buyer
    const buyer = await buyerRepository.findById(request.userId, tx);
    if (!buyer) {
      throw new Error('Buyer record not found for top-up request.');
    }

    // 4. Update top_up_requests status to REJECTED in DB
    const updatedRequest = await topUpRequestRepository.updateStatus(
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
  });

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
 * Cancels an active INITIATED Top-Up Request for a Buyer:
 * 1. Fetches the active top-up request (INITIATED or PENDING).
 * 2. If no active request exists, throws NoActiveTopUpRequestError.
 * 3. If request is in PENDING status, throws CannotCancelPendingTopUpError (no mutation).
 * 4. If request is in INITIATED status, updates status to 'CANCELLED' in a single UPDATE statement.
 * 5. Does not write ledger entries or mutate wallet balance.
 */
export async function cancelTopUp(
  input: CancelTopUpInput,
  dbClient?: DbClient,
  options?: CancelTopUpOptions
): Promise<CancelTopUpResult> {
  const client = dbClient ?? getDefaultDb();
  const now = options?.now ?? new Date();

  // 1. Fetch active request
  const activeRequest = await topUpRequestRepository.findActiveByUserId(
    input.userId,
    client
  );

  if (!activeRequest) {
    throw new NoActiveTopUpRequestError('No active top-up request found to cancel.');
  }

  // 2. Aggregate domain validation & transition
  activeRequest.cancel(now);

  // 3. Persist CANCELLED update (single UPDATE statement)
  const updatedRequest = await topUpRequestRepository.updateStatus(
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
export async function getLatestTopUpRequest(
  userId: string,
  dbClient?: DbClient
): Promise<TopUpRequest | null> {
  const client = dbClient ?? getDefaultDb();
  return await topUpRequestRepository.findLatestByUserId(userId, client);
}


