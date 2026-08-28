import { createAppContainer } from '@/core/di/container';
import { TopUpService } from '@/modules/top-up/top-up.service';
import type { TopUpLimits } from '@/modules/top-up/top-up.limits.vo';
import type { TopUpRequest } from '@/modules/top-up/top-up-request.entity';
import type { DbClient } from '@/core/database/client';
import type {
  InitiateTopUpInput,
  InitiateTopUpResult,
  SubmitReceiptInput,
  SubmitReceiptOptions,
  SubmitReceiptResult,
  ApproveTopUpInput,
  ApproveTopUpDependencies,
  ApproveTopUpResult,
  RejectTopUpInput,
  RejectTopUpDependencies,
  RejectTopUpResult,
  CancelTopUpInput,
  CancelTopUpOptions,
  CancelTopUpResult,
  PendingTopUpRequestItem,
} from '@/modules/top-up/dtos/top-up.dto';

export * from '@/modules/top-up/dtos/top-up.dto';

export async function initiateTopUp(
  input: InitiateTopUpInput,
  dbClient?: DbClient,
  customLimits?: TopUpLimits
): Promise<InitiateTopUpResult> {
  const container = createAppContainer({ dbClient, topUpLimits: customLimits, child: true });
  const service = container.resolve(TopUpService);
  return await service.initiateTopUp(input, customLimits, dbClient);
}

export async function getActiveTopUpRequest(
  userId: string,
  dbClient?: DbClient
): Promise<TopUpRequest | null> {
  const container = createAppContainer({ dbClient, child: true });
  const service = container.resolve(TopUpService);
  return await service.getActiveTopUpRequest(userId, dbClient);
}

export async function submitReceipt(
  input: SubmitReceiptInput,
  dbClient?: DbClient,
  options?: SubmitReceiptOptions
): Promise<SubmitReceiptResult> {
  const container = createAppContainer({ dbClient, child: true });
  const service = container.resolve(TopUpService);
  return await service.submitReceipt(input, options, dbClient);
}

export async function approveTopUp(
  input: ApproveTopUpInput,
  dbClient?: DbClient,
  dependencies?: ApproveTopUpDependencies
): Promise<ApproveTopUpResult> {
  const container = createAppContainer({ dbClient, child: true });
  const service = container.resolve(TopUpService);
  return await service.approveTopUp(input, dependencies, dbClient);
}

export async function rejectTopUp(
  input: RejectTopUpInput,
  dbClient?: DbClient,
  dependencies?: RejectTopUpDependencies
): Promise<RejectTopUpResult> {
  const container = createAppContainer({ dbClient, child: true });
  const service = container.resolve(TopUpService);
  return await service.rejectTopUp(input, dependencies, dbClient);
}

export async function cancelTopUp(
  input: CancelTopUpInput,
  dbClient?: DbClient,
  options?: CancelTopUpOptions
): Promise<CancelTopUpResult> {
  const container = createAppContainer({ dbClient, child: true });
  const service = container.resolve(TopUpService);
  return await service.cancelTopUp(input, options, dbClient);
}

export async function getLatestTopUpRequest(
  userId: string,
  dbClient?: DbClient
): Promise<TopUpRequest | null> {
  const container = createAppContainer({ dbClient, child: true });
  const service = container.resolve(TopUpService);
  return await service.getLatestTopUpRequest(userId, dbClient);
}

export async function getPendingRequests(
  dbClient?: DbClient
): Promise<PendingTopUpRequestItem[]> {
  const container = createAppContainer({ dbClient, child: true });
  const service = container.resolve(TopUpService);
  return await service.getPendingRequests(dbClient);
}

export async function getPendingRequestById(
  id: string,
  dbClient?: DbClient
): Promise<PendingTopUpRequestItem | null> {
  const container = createAppContainer({ dbClient, child: true });
  const service = container.resolve(TopUpService);
  return await service.getPendingRequestById(id, dbClient);
}
