import type { TopUpRequest, TopUpStatus } from './top-up-request.entity';
import type { UsdAmount, IrrAmount } from '../shared/money.vo';

export interface PendingTopUpRequestItem {
  id: string;
  userId: string;
  telegramChatId: bigint;
  telegramUsername: string | null;
  usdAmount: string;
  irrAmount: bigint;
  status: 'PENDING';
  receiptFileId: string | null;
  receiptCaption: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Domain Repository Interface for TopUpRequest.
 */
export interface ITopUpRequestRepository<TExecutor = unknown> {
  findById(id: string, executor?: TExecutor): Promise<TopUpRequest | null>;
  findByIdForUpdate(id: string, executor: TExecutor): Promise<TopUpRequest | null>;
  findByIdWithBuyer(id: string, executor?: TExecutor): Promise<PendingTopUpRequestItem | null>;
  findPendingWithBuyer(executor?: TExecutor): Promise<PendingTopUpRequestItem[]>;
  findActiveByUserId(userId: string, executor?: TExecutor): Promise<TopUpRequest | null>;
  findInitiatedByUserId(userId: string, executor?: TExecutor): Promise<TopUpRequest | null>;
  findLatestByUserId(userId: string, executor?: TExecutor): Promise<TopUpRequest | null>;
  insert(
    data: {
      userId: string;
      exchangeRateId: string;
      usdAmount: UsdAmount | string;
      irrAmount: IrrAmount | bigint;
      status: TopUpStatus;
      expiresAt: Date;
    },
    executor?: TExecutor
  ): Promise<TopUpRequest>;
  updateStatus(
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
    executor?: TExecutor
  ): Promise<TopUpRequest | null>;
}
