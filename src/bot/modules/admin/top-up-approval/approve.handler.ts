import type { Context } from 'grammy';
import type { DbClient } from '@/core/database/client';
import { createAppContainer } from '@/core/di/container';
import { TopUpService } from '@/modules/top-up/top-up.service';
import { handleApproveCallback as handleApproveNew } from '@/modules/top-up/presentation/admin/approve.handler';

export interface ApproveHandlerOptions {
  adminIds?: string | Set<bigint> | undefined;
}

export async function handleApproveCallback(
  ctx: Context,
  dbClient?: DbClient,
  options?: ApproveHandlerOptions
): Promise<void> {
  const container = createAppContainer({ dbClient, child: true });
  return await handleApproveNew(ctx, {
    topUpService: container.resolve(TopUpService),
    adminIds: options?.adminIds,
  });
}
