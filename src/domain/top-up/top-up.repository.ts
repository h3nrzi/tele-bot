import type { TopUpRequest, TopUpStatus } from './top-up-request.entity';
import type { UsdAmount, IrrAmount } from '../shared/money.vo';

/**
 * Domain Repository Interface for TopUpRequest.
 */
export interface ITopUpRequestRepository<TExecutor = unknown> {
  findById(id: string, executor?: TExecutor): Promise<TopUpRequest | null>;
  findByIdForUpdate(id: string, executor: TExecutor): Promise<TopUpRequest | null>;
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
