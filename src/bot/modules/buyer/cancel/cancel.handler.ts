import type { Context } from 'grammy';
import type { DbClient } from '@/core/database/client';
import { createAppContainer } from '@/core/di/container';
import { TOKENS } from '@/core/di/tokens';
import type { IBuyerRepository } from '@/modules/buyer/buyer.repository.interface';
import { TopUpService } from '@/modules/top-up/top-up.service';
import { handleCancelCommand as handleCancelNew } from '@/modules/top-up/presentation/buyer/cancel.handler';

export async function handleCancelCommand(
  ctx: Context,
  dbClient?: DbClient
): Promise<void> {
  const container = createAppContainer({ dbClient, child: true });
  return await handleCancelNew(ctx, {
    buyerRepo: container.resolve<IBuyerRepository>(TOKENS.BuyerRepository),
    topUpService: container.resolve(TopUpService),
  });
}
