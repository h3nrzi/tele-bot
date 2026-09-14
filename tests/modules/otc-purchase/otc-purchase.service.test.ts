import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { OtcPurchaseService } from '@/modules/otc-purchase/otc-purchase.service';
import { DrizzleOtcPurchaseRepository } from '@/modules/otc-purchase/otc-purchase.repository';
import type { WallexClient } from '@/modules/wallex/wallex.client.interface';
import { BuyerService } from '@/modules/buyer/buyer.service';
import { TopUpService } from '@/modules/top-up/top-up.service';
import { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import {
  DuplicateActiveOtcPurchaseError,
  InvalidOtcPurchaseStateError,
  OtcPurchaseNotFoundError,
} from '@/modules/otc-purchase/otc-purchase.errors';
import { wallexOtcPurchases } from '@/modules/otc-purchase/otc-purchase.schema';
import { eq } from 'drizzle-orm';

describe('OtcPurchaseService', () => {
  const { db, container } = setupTestDatabase();
  let service: OtcPurchaseService;
  let repo: DrizzleOtcPurchaseRepository;
  let buyerService: BuyerService;
  let topUpService: TopUpService;
  let exchangeRateService: ExchangeRateService;
  let mockWallexClient: WallexClient;

  beforeEach(() => {
    repo = new DrizzleOtcPurchaseRepository(db);
    buyerService = container.resolve(BuyerService);
    topUpService = container.resolve(TopUpService);
    exchangeRateService = container.resolve(ExchangeRateService);

    mockWallexClient = {
      getOtcPrice: vi.fn().mockResolvedValue({
        symbol: 'USDTTMN',
        side: 'BUY',
        priceIrr: 6000000n, // 600,000 TMN * 10 = 6,000,000 IRR
        ttlSeconds: 15,
      }),
      placeOtcOrder: vi.fn().mockResolvedValue({
        clientOrderId: 'wallex-ord-abc-123',
        executedPriceIrr: 6000000n,
        executedQty: '50.00',
        executedSumIrr: 300000000n,
        feeIrr: 300000n,
      }),
    };

    service = new OtcPurchaseService({
      otcPurchaseRepo: repo,
      wallexClient: mockWallexClient,
    });
  });

  async function seedTopUpRequest(amount = '50.00') {
    const { buyer } = await buyerService.register({
      telegramChatId: BigInt(Math.floor(Math.random() * 1000000) + 1000),
      telegramUsername: 'otc_buyer',
    });
    await exchangeRateService.setRate({
      adminTelegramId: 888n,
      irrPerUsd: 600000n,
    });
    const { request } = await topUpService.initiateTopUp({
      userId: buyer.id,
      usdAmount: amount,
    });
    return request;
  }

  it('happy path: executes OTC purchase, transitions to COMPLETED, records execution details and triggers notifySuccess', async () => {
    const topUpRequest = await seedTopUpRequest('50.00');
    const notifySuccess = vi.fn().mockResolvedValue(undefined);
    const notifyFailure = vi.fn().mockResolvedValue(undefined);

    const purchase = await service.execute(topUpRequest, {
      notifySuccess,
      notifyFailure,
    });

    expect(purchase).toBeDefined();
    expect(purchase.status).toBe('COMPLETED');
    expect(purchase.isCompleted()).toBe(true);
    expect(purchase.wallexClientOrderId).toBe('wallex-ord-abc-123');
    expect(purchase.wallexExecutedPrice).toBe(6000000n);
    expect(Number(purchase.wallexExecutedQty)).toBe(50);
    expect(purchase.wallexExecutedSum).toBe(300000000n);
    expect(purchase.wallexFee).toBe(300000n);
    expect(purchase.errorMessage).toBeNull();

    // Verify Wallex calls
    expect(mockWallexClient.getOtcPrice).toHaveBeenCalledWith('USDTTMN', 'BUY');
    expect(mockWallexClient.placeOtcOrder).toHaveBeenCalledWith('USDTTMN', 'BUY', '50.00');

    // Verify notifications
    expect(notifySuccess).toHaveBeenCalledTimes(1);
    expect(notifySuccess).toHaveBeenCalledWith(purchase);
    expect(notifyFailure).not.toHaveBeenCalled();

    // Verify persisted in DB
    const [dbRow] = await db
      .select()
      .from(wallexOtcPurchases)
      .where(eq(wallexOtcPurchases.id, purchase.id));
    expect(dbRow!.status).toBe('COMPLETED');
    expect(dbRow!.wallexClientOrderId).toBe('wallex-ord-abc-123');
  });

  it('wallex failure: transitions to FAILED, records error_message and triggers notifyFailure', async () => {
    const topUpRequest = await seedTopUpRequest('75.00');
    (mockWallexClient.placeOtcOrder as any).mockRejectedValue(
      new Error('Insufficient TMN balance on Wallex')
    );

    const notifySuccess = vi.fn().mockResolvedValue(undefined);
    const notifyFailure = vi.fn().mockResolvedValue(undefined);

    const purchase = await service.execute(topUpRequest, {
      notifySuccess,
      notifyFailure,
    });

    expect(purchase.status).toBe('FAILED');
    expect(purchase.isFailed()).toBe(true);
    expect(purchase.errorMessage).toBe('Insufficient TMN balance on Wallex');
    expect(purchase.wallexClientOrderId).toBeNull();

    expect(notifySuccess).not.toHaveBeenCalled();
    expect(notifyFailure).toHaveBeenCalledTimes(1);
    expect(notifyFailure).toHaveBeenCalledWith(
      purchase,
      'Insufficient TMN balance on Wallex'
    );

    // Verify persisted in DB as FAILED
    const [dbRow] = await db
      .select()
      .from(wallexOtcPurchases)
      .where(eq(wallexOtcPurchases.id, purchase.id));
    expect(dbRow!.status).toBe('FAILED');
    expect(dbRow!.errorMessage).toBe('Insufficient TMN balance on Wallex');
  });

  it('notification failure resilience: does not throw or compromise purchase outcome when notification callback rejects', async () => {
    const topUpRequest = await seedTopUpRequest('50.00');
    const failingNotify = vi.fn().mockRejectedValue(new Error('Telegram API offline'));

    const purchase = await service.execute(topUpRequest, {
      notifySuccess: failingNotify,
    });

    expect(purchase.status).toBe('COMPLETED');
    expect(failingNotify).toHaveBeenCalledTimes(1);
  });

  it('retry: inserts new PENDING row for failed purchase, executes to COMPLETED, and preserves original FAILED row', async () => {
    const topUpRequest = await seedTopUpRequest('100.00');

    // 1. Initial execution fails
    (mockWallexClient.placeOtcOrder as any).mockRejectedValueOnce(
      new Error('Connection timeout')
    );
    const failedPurchase = await service.execute(topUpRequest);
    expect(failedPurchase.status).toBe('FAILED');

    // 2. Retry succeeds
    const notifySuccess = vi.fn().mockResolvedValue(undefined);
    const retriedPurchase = await service.retry(failedPurchase.id, {
      notifySuccess,
    });

    expect(retriedPurchase.status).toBe('COMPLETED');
    expect(retriedPurchase.id).not.toBe(failedPurchase.id);
    expect(retriedPurchase.topUpRequestId).toBe(topUpRequest.id);
    expect(retriedPurchase.wallexClientOrderId).toBe('wallex-ord-abc-123');
    expect(notifySuccess).toHaveBeenCalledTimes(1);

    // 3. Verify audit history in DB: original FAILED row + new COMPLETED row
    const history = await repo.findByTopUpRequestId(topUpRequest.id);
    expect(history).toHaveLength(2);
    expect(history[0]!.id).toBe(failedPurchase.id);
    expect(history[0]!.status).toBe('FAILED');
    expect(history[1]!.id).toBe(retriedPurchase.id);
    expect(history[1]!.status).toBe('COMPLETED');
  });

  it('retry guards: throws error if purchase is not found or not in FAILED state', async () => {
    // 1. Not found
    await expect(service.retry('00000000-0000-0000-0000-000000000000')).rejects.toThrow(
      OtcPurchaseNotFoundError
    );

    // 2. Already COMPLETED
    const topUpRequest = await seedTopUpRequest('50.00');
    const completedPurchase = await service.execute(topUpRequest);
    expect(completedPurchase.status).toBe('COMPLETED');

    await expect(service.retry(completedPurchase.id)).rejects.toThrow(
      InvalidOtcPurchaseStateError
    );
  });

  it('duplicate prevention: disallows duplicate active purchases for the same top-up request', async () => {
    const topUpRequest = await seedTopUpRequest('50.00');
    await service.execute(topUpRequest);

    // Attempting another execute on the already COMPLETED topUpRequest should throw DuplicateActiveOtcPurchaseError
    await expect(service.execute(topUpRequest)).rejects.toThrow(
      DuplicateActiveOtcPurchaseError
    );
  });
});
