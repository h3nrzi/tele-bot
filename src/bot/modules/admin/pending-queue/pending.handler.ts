import type { Context } from 'grammy';
import type { DbClient } from '@/core/database/client';
import { createAppContainer } from '@/core/di/container';
import { TopUpService } from '@/modules/top-up/top-up.service';
import {
  handlePending as handlePendingNew,
  handlePendingPage as handlePendingPageNew,
  handleReviewCallback as handleReviewNew,
  PENDING_PAGE_SIZE,
  type PendingHandlerOptions,
} from '@/modules/top-up/presentation/admin/pending.handler';

export { PENDING_PAGE_SIZE, type PendingHandlerOptions };

export async function handlePending(
  ctx: Context,
  dbClient?: DbClient,
  options?: PendingHandlerOptions
): Promise<void> {
  const container = createAppContainer({ dbClient, child: true });
  return await handlePendingNew(ctx, container.resolve(TopUpService), options);
}

export async function handlePendingPage(
  ctx: Context,
  dbClient?: DbClient,
  options?: PendingHandlerOptions
): Promise<void> {
  const container = createAppContainer({ dbClient, child: true });
  return await handlePendingPageNew(ctx, container.resolve(TopUpService), options);
}

export async function handleReviewCallback(
  ctx: Context,
  dbClient?: DbClient
): Promise<void> {
  const container = createAppContainer({ dbClient, child: true });
  return await handleReviewNew(ctx, container.resolve(TopUpService));
}
