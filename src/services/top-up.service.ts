import { eq, and, inArray } from 'drizzle-orm';
import type { DbClient } from '../db/client';
import { getDefaultDb } from '../db/client';
import { topUpRequests, type TopUpRequest } from '../db/schema/top-up-requests';
import { type ExchangeRate } from '../db/schema/exchange-rates';
import { getCurrentRate } from './exchange-rate.service';
import {
  getTopUpLimits,
  validateTopUpAmount,
  computeIrrAmount,
  type TopUpLimits,
} from '../utils/currency';
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
