import { injectable, inject } from 'tsyringe';
import { eq, inArray, and, asc } from 'drizzle-orm';
import { wallexOtcPurchases } from './otc-purchase.schema';
import { OtcPurchase } from './otc-purchase.entity';
import type { IOtcPurchaseRepository } from './otc-purchase.repository.interface';
import { DuplicateActiveOtcPurchaseError } from './otc-purchase.errors';
import { getDefaultDb, type DbClient } from '@/core/database/client';
import type { DbExecutor } from '@/core/database/types';
import { TOKENS } from '@/core/di/tokens';

@injectable()
export class DrizzleOtcPurchaseRepository
  implements IOtcPurchaseRepository<DbExecutor>
{
  constructor(
    @inject(TOKENS.DbClient) private readonly defaultDb?: DbClient
  ) {}

  private getDb(executor?: DbExecutor): DbExecutor {
    return executor ?? this.defaultDb ?? getDefaultDb();
  }

  public async insert(
    purchase: OtcPurchase,
    executor?: DbExecutor
  ): Promise<OtcPurchase> {
    const db = this.getDb(executor);

    try {
      const [row] = await db
        .insert(wallexOtcPurchases)
        .values({
          id: purchase.id,
          topUpRequestId: purchase.topUpRequestId,
          usdtQuantity: purchase.usdtQuantity,
          status: purchase.status,
          wallexClientOrderId: purchase.wallexClientOrderId,
          wallexExecutedPrice: purchase.wallexExecutedPrice,
          wallexExecutedQty: purchase.wallexExecutedQty,
          wallexExecutedSum: purchase.wallexExecutedSum,
          wallexFee: purchase.wallexFee,
          errorMessage: purchase.errorMessage,
          createdAt: purchase.createdAt,
          updatedAt: purchase.updatedAt,
        })
        .returning();

      if (!row) {
        throw new Error('Failed to insert OTC purchase');
      }

      return this.mapToEntity(row);
    } catch (err: any) {
      if (
        err?.code === '23505' ||
        err?.message?.includes('wallex_otc_purchases_top_up_request_id_active_idx')
      ) {
        throw new DuplicateActiveOtcPurchaseError(
          `An active or completed OTC purchase already exists for top-up request ${purchase.topUpRequestId}.`
        );
      }
      throw err;
    }
  }

  public async update(
    purchase: OtcPurchase,
    executor?: DbExecutor
  ): Promise<OtcPurchase> {
    const db = this.getDb(executor);

    const [row] = await db
      .update(wallexOtcPurchases)
      .set({
        status: purchase.status,
        wallexClientOrderId: purchase.wallexClientOrderId,
        wallexExecutedPrice: purchase.wallexExecutedPrice,
        wallexExecutedQty: purchase.wallexExecutedQty,
        wallexExecutedSum: purchase.wallexExecutedSum,
        wallexFee: purchase.wallexFee,
        errorMessage: purchase.errorMessage,
        updatedAt: purchase.updatedAt,
      })
      .where(eq(wallexOtcPurchases.id, purchase.id))
      .returning();

    if (!row) {
      throw new Error(`OTC purchase with ID ${purchase.id} not found for update`);
    }

    return this.mapToEntity(row);
  }

  public async findById(
    id: string,
    executor?: DbExecutor
  ): Promise<OtcPurchase | null> {
    const db = this.getDb(executor);
    const [row] = await db
      .select()
      .from(wallexOtcPurchases)
      .where(eq(wallexOtcPurchases.id, id))
      .limit(1);

    if (!row) {
      return null;
    }

    return this.mapToEntity(row);
  }

  public async findByTopUpRequestId(
    topUpRequestId: string,
    executor?: DbExecutor
  ): Promise<OtcPurchase[]> {
    const db = this.getDb(executor);
    const rows = await db
      .select()
      .from(wallexOtcPurchases)
      .where(eq(wallexOtcPurchases.topUpRequestId, topUpRequestId))
      .orderBy(asc(wallexOtcPurchases.createdAt));

    return rows.map((r) => this.mapToEntity(r));
  }

  public async findActiveByTopUpRequestId(
    topUpRequestId: string,
    executor?: DbExecutor
  ): Promise<OtcPurchase | null> {
    const db = this.getDb(executor);
    const [row] = await db
      .select()
      .from(wallexOtcPurchases)
      .where(
        and(
          eq(wallexOtcPurchases.topUpRequestId, topUpRequestId),
          inArray(wallexOtcPurchases.status, ['PENDING', 'COMPLETED'])
        )
      )
      .limit(1);

    if (!row) {
      return null;
    }

    return this.mapToEntity(row);
  }

  private mapToEntity(row: typeof wallexOtcPurchases.$inferSelect): OtcPurchase {
    return new OtcPurchase({
      id: row.id,
      topUpRequestId: row.topUpRequestId,
      usdtQuantity: row.usdtQuantity,
      status: row.status,
      wallexClientOrderId: row.wallexClientOrderId,
      wallexExecutedPrice: row.wallexExecutedPrice,
      wallexExecutedQty: row.wallexExecutedQty,
      wallexExecutedSum: row.wallexExecutedSum,
      wallexFee: row.wallexFee,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}

export const OtcPurchaseRepository = DrizzleOtcPurchaseRepository;
