import { injectable, inject } from 'tsyringe';
import crypto from 'node:crypto';
import type Decimal from 'decimal.js';
import { TOKENS } from '@/core/di/tokens';
import type { IOtcPurchaseRepository } from './otc-purchase.repository.interface';
import type { WallexClient } from '@/modules/wallex/wallex.client.interface';
import type { IOtcPurchaseNotifier } from './otc-purchase.notifier.interface';
import { OtcPurchase } from './otc-purchase.entity';
import {
  OtcPurchaseNotFoundError,
  InvalidOtcPurchaseStateError,
} from './otc-purchase.errors';
import type { UsdAmount } from '@/core/shared/money.vo';
import type { TopUpRequest } from '@/modules/top-up/top-up-request.entity';

export interface TopUpRequestReference {
  id: string;
  usdAmount: string | number | Decimal | UsdAmount;
}

export interface OtcPurchaseServiceDependencies {
  notifier?: IOtcPurchaseNotifier | undefined;
  notifySuccess?: (purchase: OtcPurchase) => Promise<void> | void;
  notifyFailure?: (purchase: OtcPurchase, error?: string) => Promise<void> | void;
}

export interface OtcPurchaseServiceOptions {
  otcPurchaseRepo: IOtcPurchaseRepository;
  wallexClient: WallexClient;
  notifier?: IOtcPurchaseNotifier | undefined;
}

@injectable()
export class OtcPurchaseService {
  private readonly otcPurchaseRepo: IOtcPurchaseRepository;
  private readonly wallexClient: WallexClient;
  private readonly notifier?: IOtcPurchaseNotifier | undefined;

  constructor(
    @inject(TOKENS.OtcPurchaseRepository)
    repoOrOptions: IOtcPurchaseRepository | OtcPurchaseServiceOptions,
    @inject(TOKENS.WallexClient)
    wallexClient?: WallexClient,
    @inject(TOKENS.OtcPurchaseNotifier)
    notifier?: IOtcPurchaseNotifier
  ) {
    if ('otcPurchaseRepo' in repoOrOptions) {
      this.otcPurchaseRepo = repoOrOptions.otcPurchaseRepo;
      this.wallexClient = repoOrOptions.wallexClient;
      this.notifier = repoOrOptions.notifier;
    } else {
      this.otcPurchaseRepo = repoOrOptions;
      this.wallexClient = wallexClient!;
      this.notifier = notifier;
    }
  }

  /**
   * Executes an automated OTC market buy on Wallex for the specified top-up request.
   *
   * Flow:
   * 1. Inserts a PENDING row in wallex_otc_purchases (enforces partial uniqueness).
   * 2. Fetches fresh OTC price quote via WallexClient (GET /v1/account/otc/price).
   * 3. Places OTC market order within the 15s TTL window (POST /v1/account/easy-trade/orders).
   * 4. On success: transitions to COMPLETED with execution details, updates DB, fires success notification.
   * 5. On failure: transitions to FAILED with error message, updates DB, fires failure notification.
   */
  public async execute(
    topUpRequest: TopUpRequest | TopUpRequestReference,
    dependencies?: OtcPurchaseServiceDependencies
  ): Promise<OtcPurchase> {
    const rawUsdAmount =
      typeof topUpRequest.usdAmount === 'object' && 'format' in topUpRequest.usdAmount
        ? (topUpRequest.usdAmount as UsdAmount).toDecimal().toFixed(2)
        : String(topUpRequest.usdAmount);

    const purchase = new OtcPurchase({
      id: crypto.randomUUID(),
      topUpRequestId: topUpRequest.id,
      usdtQuantity: rawUsdAmount,
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const savedPurchase = await this.otcPurchaseRepo.insert(purchase);

    try {
      // 1. Fetch fresh OTC price quote
      await this.wallexClient.getOtcPrice('USDTTMN', 'BUY');

      // 2. Place OTC market order within 15s TTL window
      const orderResult = await this.wallexClient.placeOtcOrder(
        'USDTTMN',
        'BUY',
        savedPurchase.usdtQuantity
      );

      // 3. Mark COMPLETED with Wallex execution details
      savedPurchase.complete({
        wallexClientOrderId: orderResult.clientOrderId,
        wallexExecutedPrice: orderResult.executedPriceIrr,
        wallexExecutedQty: orderResult.executedQty,
        wallexExecutedSum: orderResult.executedSumIrr,
        wallexFee: orderResult.feeIrr,
      });

      await this.otcPurchaseRepo.update(savedPurchase);

      // 4. Send success notification
      await this.sendNotification(savedPurchase, dependencies);

      return savedPurchase;
    } catch (err: any) {
      const errorMessage = err?.message ?? String(err);
      savedPurchase.fail(errorMessage);

      try {
        await this.otcPurchaseRepo.update(savedPurchase);
      } catch (updateErr) {
        console.error('Failed to update OTC purchase to FAILED status:', updateErr);
      }

      // Send failure notification with retry button
      await this.sendNotification(savedPurchase, dependencies, errorMessage);

      return savedPurchase;
    }
  }

  /**
   * Retries execution for a previously failed OTC purchase.
   * Inserts a new PENDING row for the same top_up_request_id (preserving the failed row for audit)
   * and re-executes.
   */
  public async retry(
    failedPurchaseId: string,
    dependencies?: OtcPurchaseServiceDependencies
  ): Promise<OtcPurchase> {
    const purchase = await this.otcPurchaseRepo.findById(failedPurchaseId);
    if (!purchase) {
      throw new OtcPurchaseNotFoundError(
        `OTC purchase with ID ${failedPurchaseId} not found.`
      );
    }

    if (!purchase.isFailed()) {
      throw new InvalidOtcPurchaseStateError(
        `Cannot retry OTC purchase with status ${purchase.status}. Only FAILED purchases can be retried.`
      );
    }

    return await this.execute(
      {
        id: purchase.topUpRequestId,
        usdAmount: purchase.usdtQuantityVo,
      },
      dependencies
    );
  }

  private async sendNotification(

    purchase: OtcPurchase,
    dependencies?: OtcPurchaseServiceDependencies,
    error?: string
  ): Promise<void> {
    try {
      if (purchase.isCompleted()) {
        if (dependencies?.notifySuccess) {
          await dependencies.notifySuccess(purchase);
        } else if (dependencies?.notifier) {
          await dependencies.notifier.notifySuccess(purchase);
        } else if (this.notifier) {
          await this.notifier.notifySuccess(purchase);
        }
      } else if (purchase.isFailed()) {
        if (dependencies?.notifyFailure) {
          await dependencies.notifyFailure(purchase, error);
        } else if (dependencies?.notifier) {
          await dependencies.notifier.notifyFailure(purchase, error);
        } else if (this.notifier) {
          await this.notifier.notifyFailure(purchase, error);
        }
      }
    } catch (notifyErr) {
      console.error('Failed to dispatch OTC purchase notification:', notifyErr);
    }
  }
}
