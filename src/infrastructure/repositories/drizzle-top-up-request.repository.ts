import { eq, and, inArray } from 'drizzle-orm';
import { topUpRequests } from '../../db/schema/top-up-requests';
import { getDefaultDb } from '../../db/client';
import type { DbExecutor } from '../db/types';
import {
  TopUpRequest,
  type TopUpStatus,
} from '../../domain/top-up/top-up-request.entity';
import type { ITopUpRequestRepository } from '../../domain/top-up/top-up.repository';
import { UsdAmount, IrrAmount } from '../../domain/shared/money.vo';

export class DrizzleTopUpRequestRepository
  implements ITopUpRequestRepository<DbExecutor>
{
  private getDb(executor?: DbExecutor): DbExecutor {
    return executor ?? getDefaultDb();
  }

  private mapToDomain(row: typeof topUpRequests.$inferSelect): TopUpRequest {
    return new TopUpRequest({
      id: row.id,
      userId: row.userId,
      exchangeRateId: row.exchangeRateId,
      usdAmount: row.usdAmount,
      irrAmount: row.irrAmount,
      status: row.status as TopUpStatus,
      receiptFileId: row.receiptFileId,
      receiptCaption: row.receiptCaption,
      rejectionReason: row.rejectionReason,
      expiresAt: row.expiresAt,
      processedByAdminTelegramId: row.processedByAdminTelegramId,
      processedAt: row.processedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  public async findById(
    id: string,
    executor?: DbExecutor
  ): Promise<TopUpRequest | null> {
    const db = this.getDb(executor);
    const [row] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, id));

    if (!row) {
      return null;
    }

    return this.mapToDomain(row);
  }

  public async findByIdForUpdate(
    id: string,
    executor: DbExecutor
  ): Promise<TopUpRequest | null> {
    const [row] = await executor
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, id))
      .for('update');

    if (!row) {
      return null;
    }

    return this.mapToDomain(row);
  }

  public async findActiveByUserId(
    userId: string,
    executor?: DbExecutor
  ): Promise<TopUpRequest | null> {
    const db = this.getDb(executor);
    const [row] = await db
      .select()
      .from(topUpRequests)
      .where(
        and(
          eq(topUpRequests.userId, userId),
          inArray(topUpRequests.status, ['INITIATED', 'PENDING'])
        )
      )
      .limit(1);

    if (!row) {
      return null;
    }

    return this.mapToDomain(row);
  }

  public async findInitiatedByUserId(
    userId: string,
    executor?: DbExecutor
  ): Promise<TopUpRequest | null> {
    const db = this.getDb(executor);
    const [row] = await db
      .select()
      .from(topUpRequests)
      .where(
        and(
          eq(topUpRequests.userId, userId),
          eq(topUpRequests.status, 'INITIATED')
        )
      )
      .limit(1);

    if (!row) {
      return null;
    }

    return this.mapToDomain(row);
  }

  public async insert(
    data: {
      userId: string;
      exchangeRateId: string;
      usdAmount: UsdAmount | string;
      irrAmount: IrrAmount | bigint;
      status: TopUpStatus;
      expiresAt: Date;
    },
    executor?: DbExecutor
  ): Promise<TopUpRequest> {
    const db = this.getDb(executor);
    const usdStr =
      data.usdAmount instanceof UsdAmount
        ? data.usdAmount.toString()
        : data.usdAmount;
    const irrBigInt =
      data.irrAmount instanceof IrrAmount
        ? data.irrAmount.toBigInt()
        : data.irrAmount;

    const [row] = await db
      .insert(topUpRequests)
      .values({
        userId: data.userId,
        exchangeRateId: data.exchangeRateId,
        usdAmount: usdStr,
        irrAmount: irrBigInt,
        status: data.status,
        expiresAt: data.expiresAt,
      })
      .returning();

    if (!row) {
      throw new Error('Failed to insert top-up request');
    }

    return this.mapToDomain(row);
  }

  public async updateStatus(
    id: string,
    status: TopUpStatus,
    updates?: {
      receiptFileId?: string | null;
      receiptCaption?: string | null;
      rejectionReason?: string | null;
      processedByAdminTelegramId?: bigint | null;
      processedAt?: Date | null;
      updatedAt?: Date;
    },
    executor?: DbExecutor
  ): Promise<TopUpRequest | null> {
    const db = this.getDb(executor);
    const [row] = await db
      .update(topUpRequests)
      .set({
        status,
        ...(updates?.receiptFileId !== undefined && {
          receiptFileId: updates.receiptFileId,
        }),
        ...(updates?.receiptCaption !== undefined && {
          receiptCaption: updates.receiptCaption,
        }),
        ...(updates?.rejectionReason !== undefined && {
          rejectionReason: updates.rejectionReason,
        }),
        ...(updates?.processedByAdminTelegramId !== undefined && {
          processedByAdminTelegramId: updates.processedByAdminTelegramId,
        }),
        ...(updates?.processedAt !== undefined && {
          processedAt: updates.processedAt,
        }),
        updatedAt: updates?.updatedAt ?? new Date(),
      })
      .where(eq(topUpRequests.id, id))
      .returning();

    if (!row) {
      return null;
    }

    return this.mapToDomain(row);
  }
}

export const topUpRequestRepository = new DrizzleTopUpRequestRepository();
