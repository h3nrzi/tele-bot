import type { Context } from 'grammy';
import type { DbClient } from '@/core/database/client';
import { createAppContainer } from '@/core/di/container';
import { BuyerService } from '@/modules/buyer/buyer.service';
import { handleStart as handleStartNew } from '@/modules/buyer/presentation/start.handler';

export async function handleStart(
  ctx: Context,
  dbClient?: DbClient,
  options?: { adminIds?: string | Set<bigint> | undefined }
): Promise<void> {
  const container = createAppContainer({ dbClient, child: true });
  const buyerService = container.resolve(BuyerService);
  return await handleStartNew(ctx, buyerService, options);
}
