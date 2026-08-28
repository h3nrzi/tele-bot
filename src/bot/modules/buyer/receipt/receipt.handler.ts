import type { Context } from 'grammy';
import type { DbClient } from '@/core/database/client';
import { createAppContainer } from '@/core/di/container';
import { BuyerService } from '@/modules/buyer/buyer.service';
import { TopUpService } from '@/modules/top-up/top-up.service';
import { handlePhotoMessage as handlePhotoNew } from '@/modules/top-up/presentation/buyer/receipt.handler';

export interface PhotoHandlerOptions {
  adminIds?: string | Set<bigint> | undefined;
  now?: Date | undefined;
}

export async function handlePhotoMessage(
  ctx: Context,
  dbClient?: DbClient,
  options?: PhotoHandlerOptions
): Promise<void> {
  const container = createAppContainer({ dbClient, child: true });
  return await handlePhotoNew(ctx, {
    buyerService: container.resolve(BuyerService),
    topUpService: container.resolve(TopUpService),
    adminIds: options?.adminIds,
    now: options?.now,
  });
}
