import { eq, and, inArray } from 'drizzle-orm';
import type { DbClient } from '../db/client';
import { getDefaultDb } from '../db/client';
import { users } from '../db/schema/users';
import { wallets, type Wallet } from '../db/schema/wallets';
import {
  ledgerTransactions,
  ledgerEntries,
  type LedgerTransaction,
  type LedgerEntry,
} from '../db/schema/ledger';
import { topUpRequests, type TopUpRequest } from '../db/schema/top-up-requests';
import { type ExchangeRate } from '../db/schema/exchange-rates';
import { getCurrentRate } from './exchange-rate.service';
import {
  getTopUpLimits,
  validateTopUpAmount,
  computeIrrAmount,
  type TopUpLimits,
} from '../utils/currency';
import { normalizeChatId } from '../utils/telegram';
import Decimal from 'decimal.js';

export class NoExchangeRateError extends Error {
  constructor(message = 'No exchange rate has been configured.') {
    super(message);
    this.name = 'NoExchangeRateError';
  }
}

export class ActiveTopUpRequestExistsError extends Error {
  constructor(message = 'You already have an active top-up request.') {
    super(message);
    this.name = 'ActiveTopUpRequestExistsError';
  }
}

export class InvalidTopUpAmountError extends Error {
  constructor(message = 'Invalid top-up amount.') {
    super(message);
    this.name = 'InvalidTopUpAmountError';
  }
}

export class NoInitiatedTopUpRequestError extends Error {
  constructor(message = 'No active initiated top-up request found.') {
    super(message);
    this.name = 'NoInitiatedTopUpRequestError';
  }
}

export class TopUpRequestExpiredError extends Error {
  constructor(message = 'The top-up request has expired.') {
    super(message);
    this.name = 'TopUpRequestExpiredError';
  }
}

export class TopUpRequestNotFoundError extends Error {
  constructor(message = 'Top-up request not found.') {
    super(message);
    this.name = 'TopUpRequestNotFoundError';
  }
}

export class TopUpRequestNotPendingError extends Error {
  constructor(message = 'Top-up request is not pending approval or has already been processed.') {
    super(message);
    this.name = 'TopUpRequestNotPendingError';
  }
}

export class WalletNotFoundError extends Error {
  constructor(message = 'Buyer wallet not found.') {
    super(message);
    this.name = 'WalletNotFoundError';
  }
}

export interface InitiateTopUpInput {
  userId: string;
  usdAmount: string | Decimal;
}

export interface InitiateTopUpResult {
  request: TopUpRequest;
  exchangeRate: ExchangeRate;
}

/**
 * Initiates a new Top-Up Request for a Buyer:
 * 1. Validates amount bounds against TOPUP_MIN_USD and TOPUP_MAX_USD.
 * 2. Fetches the active exchange rate via getCurrentRate(); throws NoExchangeRateError if none exists.
 * 3. Computes the exact irr_amount as round(usd_amount * irr_per_usd).
 * 4. Sets expires_at = now() + TOPUP_INITIATED_EXPIRY_MINUTES.
 * 5. Inserts the row into top_up_requests with status 'INITIATED'.
 * Catches partial unique index violations (23505) and throws ActiveTopUpRequestExistsError.
 */
export async function initiateTopUp(
  input: InitiateTopUpInput,
  dbClient?: DbClient,
  customLimits?: TopUpLimits
): Promise<InitiateTopUpResult> {
  const client = dbClient ?? getDefaultDb();
  const limits = customLimits ?? getTopUpLimits();

  // 1. Validate Amount
  const validation = validateTopUpAmount(input.usdAmount, limits);
  if (!validation.valid) {
    throw new InvalidTopUpAmountError(validation.message);
  }

  // 2. Fetch Active Exchange Rate
  const currentRate = await getCurrentRate(client);
  if (!currentRate) {
    throw new NoExchangeRateError(
      'No active exchange rate found. Top-up is temporarily unavailable.'
    );
  }

  // 3. Compute IRR Amount
  const irrAmount = computeIrrAmount(
    validation.amountDecimal,
    currentRate.irrPerUsd
  );

  // 4. Calculate expires_at
  const expiresAt = new Date(Date.now() + limits.expiryMinutes * 60 * 1000);

  // 5. Insert Top-Up Request
  try {
    const [insertedRequest] = await client
      .insert(topUpRequests)
      .values({
        userId: input.userId,
        exchangeRateId: currentRate.id,
        usdAmount: validation.amountString,
        irrAmount,
        status: 'INITIATED',
        expiresAt,
      })
      .returning();

    if (!insertedRequest) {
      throw new Error('Failed to insert top-up request');
    }

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

  const [activeRequest] = await client
    .select()
    .from(topUpRequests)
    .where(
      and(
        eq(topUpRequests.userId, userId),
        inArray(topUpRequests.status, ['INITIATED', 'PENDING'])
      )
    )
    .limit(1);

  return activeRequest ?? null;
}

export interface SubmitReceiptInput {
  userId: string;
  fileId: string;
  caption?: string | null | undefined;
}

export interface SubmitReceiptOptions {
  now?: Date | undefined;
}

export interface SubmitReceiptResult {
  request: TopUpRequest;
}

/**
 * Submits a receipt for a Buyer's active INITIATED Top-Up Request:
 * 1. Fetches the Buyer's active INITIATED request. Throws NoInitiatedTopUpRequestError if none.
 * 2. Checks if expires_at < now(). If so, updates status to 'EXPIRED' in a single UPDATE and throws TopUpRequestExpiredError.
 * 3. Updates status to 'PENDING', sets receipt_file_id and receipt_caption, and returns the updated request.
 * All operations execute atomically with no partial writes.
 */
export async function submitReceipt(
  input: SubmitReceiptInput,
  dbClient?: DbClient,
  options?: SubmitReceiptOptions
): Promise<SubmitReceiptResult> {
  const client = dbClient ?? getDefaultDb();
  const now = options?.now ?? new Date();

  // 1. Fetch active INITIATED request
  const [initiatedRequest] = await client
    .select()
    .from(topUpRequests)
    .where(
      and(
        eq(topUpRequests.userId, input.userId),
        eq(topUpRequests.status, 'INITIATED')
      )
    )
    .limit(1);

  if (!initiatedRequest) {
    throw new NoInitiatedTopUpRequestError(
      'No active initiated top-up request found.'
    );
  }

  // 2. Check Expiry
  if (initiatedRequest.expiresAt.getTime() < now.getTime()) {
    await client
      .update(topUpRequests)
      .set({
        status: 'EXPIRED',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(topUpRequests.id, initiatedRequest.id),
          eq(topUpRequests.status, 'INITIATED')
        )
      );

    throw new TopUpRequestExpiredError('The top-up request has expired.');
  }

  // 3. Update status to PENDING with receipt details
  const captionValue =
    typeof input.caption === 'string' && input.caption.trim().length > 0
      ? input.caption.trim()
      : null;

  const [updatedRequest] = await client
    .update(topUpRequests)
    .set({
      status: 'PENDING',
      receiptFileId: input.fileId,
      receiptCaption: captionValue,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(topUpRequests.id, initiatedRequest.id),
        eq(topUpRequests.status, 'INITIATED')
      )
    )
    .returning();

  if (!updatedRequest) {
    throw new NoInitiatedTopUpRequestError(
      'Top-up request is no longer initiated.'
    );
  }

  return {
    request: updatedRequest,
  };
}

export interface ApproveTopUpInput {
  topUpRequestId: string;
  adminTelegramId: bigint | number;
}

export interface ApproveTopUpDependencies {
  notifyBuyer?: (params: {
    buyerTelegramChatId: bigint;
    creditedUsdAmount: string;
    newAvailableBalance: string;
  }) => Promise<void>;
}

export interface ApproveTopUpResult {
  request: TopUpRequest;
  wallet: Wallet;
  ledgerTransaction: LedgerTransaction;
  ledgerEntries: [LedgerEntry, LedgerEntry];
  buyerChatId: bigint;
}

/**
 * Approves a pending Top-Up Request inside a single PostgreSQL transaction:
 * 1. SELECT … FROM top_up_requests WHERE id = ? FOR UPDATE
 * 2. Assert status = 'PENDING' — if not, abort and throw TopUpRequestNotPendingError
 * 3. SELECT … FROM users WHERE id = request.userId
 * 4. SELECT … FROM wallets WHERE user_id = ? FOR UPDATE
 * 5. Compute new balance = wallet.availableBalance + request.usdAmount using decimal.js (.toFixed(2))
 * 6. INSERT one ledger_transactions row
 * 7. INSERT two ledger_entries rows (DEBIT SYSTEM_CASH null wallet, CREDIT BUYER_WALLET with walletId)
 * 8. UPDATE wallets SET available_balance = newBalance, updated_at = now()
 * 9. UPDATE top_up_requests SET status = 'APPROVED', processed_by_admin_telegram_id = ?, processed_at = now()
 * 10. Dispatches notifyBuyer post-commit; notification failure does not roll back transaction.
 */
export async function approveTopUp(
  input: ApproveTopUpInput,
  dbClient?: DbClient,
  dependencies?: ApproveTopUpDependencies
): Promise<ApproveTopUpResult> {
  const client = dbClient ?? getDefaultDb();
  const adminId = normalizeChatId(input.adminTelegramId);

  const txResult = await client.transaction(async (tx) => {
    // 1. SELECT top_up_request FOR UPDATE
    const [request] = await tx
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, input.topUpRequestId))
      .for('update');

    if (!request) {
      throw new TopUpRequestNotFoundError('Top-up request not found.');
    }

    // 2. Assert status is PENDING
    if (request.status !== 'PENDING') {
      throw new TopUpRequestNotPendingError(
        'Top-up request is not pending approval or has already been processed.'
      );
    }

    // 3. Fetch Buyer User
    const [buyerUser] = await tx
      .select()
      .from(users)
      .where(eq(users.id, request.userId));

    if (!buyerUser) {
      throw new Error('Buyer user record not found for top-up request.');
    }

    // 4. SELECT wallet FOR UPDATE
    const [wallet] = await tx
      .select()
      .from(wallets)
      .where(eq(wallets.userId, request.userId))
      .for('update');

    if (!wallet) {
      throw new WalletNotFoundError('Buyer wallet not found.');
    }

    // 5. Compute new balance using decimal.js
    const currentBalance = new Decimal(wallet.availableBalance);
    const creditAmount = new Decimal(request.usdAmount);
    const newBalanceDecimal = currentBalance.plus(creditAmount);
    const newBalanceStr = newBalanceDecimal.toFixed(2);

    // 6. Insert ledger transaction
    const [ledgerTx] = await tx
      .insert(ledgerTransactions)
      .values({
        topUpRequestId: request.id,
        narrative: `Top-up approval for request ${request.id}`,
      })
      .returning();

    if (!ledgerTx) {
      throw new Error('Failed to create ledger transaction.');
    }

    // 7. Insert two ledger entries: DEBIT SYSTEM_CASH, CREDIT BUYER_WALLET
    const entries = await tx
      .insert(ledgerEntries)
      .values([
        {
          ledgerTransactionId: ledgerTx.id,
          accountType: 'SYSTEM_CASH',
          direction: 'DEBIT',
          usdAmount: request.usdAmount,
          walletId: null,
        },
        {
          ledgerTransactionId: ledgerTx.id,
          accountType: 'BUYER_WALLET',
          direction: 'CREDIT',
          usdAmount: request.usdAmount,
          walletId: wallet.id,
        },
      ])
      .returning();

    if (entries.length !== 2) {
      throw new Error('Failed to insert ledger entries.');
    }

    // 8. Update wallet available_balance
    const [updatedWallet] = await tx
      .update(wallets)
      .set({
        availableBalance: newBalanceStr,
        updatedAt: new Date(),
      })
      .where(eq(wallets.id, wallet.id))
      .returning();

    if (!updatedWallet) {
      throw new Error('Failed to update wallet balance.');
    }

    // 9. Update top_up_requests to APPROVED
    const [updatedRequest] = await tx
      .update(topUpRequests)
      .set({
        status: 'APPROVED',
        processedByAdminTelegramId: adminId,
        processedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(topUpRequests.id, request.id))
      .returning();

    if (!updatedRequest) {
      throw new Error('Failed to update top-up request status.');
    }

    return {
      request: updatedRequest,
      wallet: updatedWallet,
      ledgerTransaction: ledgerTx,
      ledgerEntries: entries as [LedgerEntry, LedgerEntry],
      buyerChatId: buyerUser.telegramChatId,
    };
  });

  // 10. Dispatch Buyer push notification after transaction commits
  if (dependencies?.notifyBuyer) {
    try {
      await dependencies.notifyBuyer({
        buyerTelegramChatId: txResult.buyerChatId,
        creditedUsdAmount: txResult.request.usdAmount,
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

