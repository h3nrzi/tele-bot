import { injectable, inject } from 'tsyringe';
import { eq, and, inArray, desc, asc } from 'drizzle-orm';
import { topUpRequests } from '@/modules/top-up/top-up.schema';
import { users } from '@/modules/buyer/buyer.schema';
import { getDefaultDb, type DbClient } from '@/core/database/client';
import type { DbExecutor } from '@/core/database/types';
import {
  TopUpRequest,
  type TopUpStatus,
} from '@/modules/top-up/top-up-request.entity';
import type {
  ITopUpRequestRepository,
  PendingTopUpRequestItem,
} from '@/modules/top-up/top-up.repository.interface';
import { UsdAmount, IrrAmount } from '@/core/shared/money.vo';
import { TOKENS } from '@/core/di/tokens';

@injectable()
export class DrizzleTopUpRequestRepository
  implements ITopUpRequestRepository<DbExecutor>
{
  constructor(
    @inject(TOKENS.DbClient) private readonly defaultDb?: DbClient
  ) {}

  private getDb(executor?: DbExecutor): DbExecutor {
    return executor ?? this.defaultDb ?? getDefaultDb();
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

  private static readonly PENDING_WITH_BUYER_SELECTION = {
    id: topUpRequests.id,
    userId: topUpRequests.userId,
    telegramChatId: users.telegramChatId,
    telegramUsername: users.telegramUsername,
    usdAmount: topUpRequests.usdAmount,
    irrAmount: topUpRequests.irrAmount,
    status: topUpRequests.status,
    receiptFileId: topUpRequests.receiptFileId,
    receiptCaption: topUpRequests.receiptCaption,
    createdAt: topUpRequests.createdAt,
    updatedAt: topUpRequests.updatedAt,
  };

  private mapToPendingItem(row: {
    id: string;
    userId: string;
    telegramChatId: bigint;
    telegramUsername: string | null;
    usdAmount: string;
    irrAmount: bigint;
    status: string;
    receiptFileId: string | null;
    receiptCaption: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): PendingTopUpRequestItem {
    return {
      id: row.id,
      userId: row.userId,
      telegramChatId: row.telegramChatId,
      telegramUsername: row.telegramUsername,
      usdAmount: row.usdAmount,
      irrAmount: row.irrAmount,
      status: 'PENDING',
      receiptFileId: row.receiptFileId,
      receiptCaption: row.receiptCaption,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  public async findByIdWithBuyer(
    id: string,
    executor?: DbExecutor
  ): Promise<PendingTopUpRequestItem | null> {
    const db = this.getDb(executor);
    const [row] = await db
      .select(DrizzleTopUpRequestRepository.PENDING_WITH_BUYER_SELECTION)
      .from(topUpRequests)
      .innerJoin(users, eq(topUpRequests.userId, users.id))
      .where(eq(topUpRequests.id, id));

    if (!row) {
      return null;
    }

    return this.mapToPendingItem(row);
  }

  public async findPendingWithBuyer(
    executor?: DbExecutor
  ): Promise<PendingTopUpRequestItem[]> {
    const db = this.getDb(executor);
    const rows = await db
      .select(DrizzleTopUpRequestRepository.PENDING_WITH_BUYER_SELECTION)
      .from(topUpRequests)
      .innerJoin(users, eq(topUpRequests.userId, users.id))
      .where(eq(topUpRequests.status, 'PENDING'))
      .orderBy(asc(topUpRequests.createdAt));

    return rows.map((r) => this.mapToPendingItem(r));
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

  public async findLatestByUserId(
    userId: string,
    executor?: DbExecutor
  ): Promise<TopUpRequest | null> {
    const db = this.getDb(executor);
    const [row] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.userId, userId))
      .orderBy(desc(topUpRequests.createdAt))
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

export const TopUpRequestRepository = DrizzleTopUpRequestRepository;

