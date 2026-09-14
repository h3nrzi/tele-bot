import { describe, it, expect, beforeEach } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { DrizzleOtcPurchaseRepository } from '@/modules/otc-purchase/otc-purchase.repository';
import { OtcPurchase } from '@/modules/otc-purchase/otc-purchase.entity';
import { DuplicateActiveOtcPurchaseError } from '@/modules/otc-purchase/otc-purchase.errors';
import { BuyerService } from '@/modules/buyer/buyer.service';
import { TopUpService } from '@/modules/top-up/top-up.service';
import { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import { UsdAmount } from '@/core/shared/money.vo';
import crypto from 'node:crypto';

describe('DrizzleOtcPurchaseRepository', () => {
  const { db, container } = setupTestDatabase();
  let repo: DrizzleOtcPurchaseRepository;
  let buyerService: BuyerService;
  let topUpService: TopUpService;
  let exchangeRateService: ExchangeRateService;

  beforeEach(() => {
    repo = new DrizzleOtcPurchaseRepository(db);
    buyerService = container.resolve(BuyerService);
    topUpService = container.resolve(TopUpService);
    exchangeRateService = container.resolve(ExchangeRateService);
  });

  async function createTopUpRequest() {
    const { buyer } = await buyerService.register({
      telegramChatId: BigInt(Math.floor(Math.random() * 1000000) + 1000),
      telegramUsername: 'test_buyer',
    });
    await exchangeRateService.setRate({
      adminTelegramId: 999n,
      irrPerUsd: 600000n,
    });
    const { request } = await topUpService.initiateTopUp({
      userId: buyer.id,
      usdAmount: '50.00',
    });
    return request;
  }

  it('inserts and retrieves an OtcPurchase by ID', async () => {
    const topUpRequest = await createTopUpRequest();
    const purchase = new OtcPurchase({
      id: crypto.randomUUID(),
      topUpRequestId: topUpRequest.id,
      usdtQuantity: new UsdAmount('50.00'),
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const inserted = await repo.insert(purchase);
    expect(inserted.id).toBe(purchase.id);
    expect(inserted.topUpRequestId).toBe(topUpRequest.id);
    expect(inserted.status).toBe('PENDING');
    expect(inserted.usdtQuantity).toBe('50.00');

    const fetched = await repo.findById(purchase.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(purchase.id);
    expect(fetched!.topUpRequestId).toBe(topUpRequest.id);
    expect(fetched!.status).toBe('PENDING');
  });

  it('updates an OtcPurchase status and Wallex execution details', async () => {
    const topUpRequest = await createTopUpRequest();
    const purchase = new OtcPurchase({
      id: crypto.randomUUID(),
      topUpRequestId: topUpRequest.id,
      usdtQuantity: '50.00',
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await repo.insert(purchase);

    purchase.complete({
      wallexClientOrderId: 'wallex-ord-999',
      wallexExecutedPrice: 6100000n,
      wallexExecutedQty: '50.00',
      wallexExecutedSum: 305000000n,
      wallexFee: 305000n,
    });

    const updated = await repo.update(purchase);
    expect(updated.status).toBe('COMPLETED');
    expect(updated.wallexClientOrderId).toBe('wallex-ord-999');
    expect(updated.wallexExecutedPrice).toBe(6100000n);
    expect(Number(updated.wallexExecutedQty)).toBe(50);
    expect(updated.wallexExecutedSum).toBe(305000000n);
    expect(updated.wallexFee).toBe(305000n);

    const fetched = await repo.findById(purchase.id);
    expect(fetched!.status).toBe('COMPLETED');
    expect(fetched!.wallexClientOrderId).toBe('wallex-ord-999');
  });

  it('enforces partial unique index: rejects concurrent PENDING/COMPLETED purchases for the same top-up request', async () => {
    const topUpRequest = await createTopUpRequest();

    const purchase1 = new OtcPurchase({
      id: crypto.randomUUID(),
      topUpRequestId: topUpRequest.id,
      usdtQuantity: '50.00',
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await repo.insert(purchase1);

    // Attempting to insert another PENDING purchase for same top-up request should throw DuplicateActiveOtcPurchaseError
    const purchase2 = new OtcPurchase({
      id: crypto.randomUUID(),
      topUpRequestId: topUpRequest.id,
      usdtQuantity: '50.00',
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(repo.insert(purchase2)).rejects.toThrow(DuplicateActiveOtcPurchaseError);
  });

  it('allows inserting a new PENDING purchase when the previous purchase is FAILED (retry audit history)', async () => {
    const topUpRequest = await createTopUpRequest();

    // 1. Initial attempt fails
    const purchase1 = new OtcPurchase({
      id: crypto.randomUUID(),
      topUpRequestId: topUpRequest.id,
      usdtQuantity: '50.00',
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await repo.insert(purchase1);

    purchase1.fail('Wallex timeout error');
    await repo.update(purchase1);

    // 2. Retry inserts a new PENDING purchase for same top_up_request_id
    const purchase2 = new OtcPurchase({
      id: crypto.randomUUID(),
      topUpRequestId: topUpRequest.id,
      usdtQuantity: '50.00',
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const inserted2 = await repo.insert(purchase2);
    expect(inserted2.id).toBe(purchase2.id);
    expect(inserted2.status).toBe('PENDING');

    // 3. Verify history preserves both rows
    const history = await repo.findByTopUpRequestId(topUpRequest.id);
    expect(history).toHaveLength(2);
    expect(history[0]!.status).toBe('FAILED');
    expect(history[1]!.status).toBe('PENDING');

    // 4. Verify active purchase returns the PENDING one
    const active = await repo.findActiveByTopUpRequestId(topUpRequest.id);
    expect(active).not.toBeNull();
    expect(active!.id).toBe(purchase2.id);
  });
});
