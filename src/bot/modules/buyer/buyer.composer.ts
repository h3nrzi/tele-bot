import type { DbClient } from '@/core/database/client';
import { createAppContainer } from '@/core/di/container';
import { createBuyerComposer as createBuyerComposerNew } from '@/modules/buyer/presentation/buyer.composer';

export interface BuyerComposerOptions {
  dbClient?: DbClient | undefined;
  adminIds?: string | Set<bigint> | undefined;
}

export function createBuyerComposer(options?: BuyerComposerOptions) {
  const container = createAppContainer({ dbClient: options?.dbClient, child: true });
  return createBuyerComposerNew({
    container,
    adminIds: options?.adminIds,
  });
}
