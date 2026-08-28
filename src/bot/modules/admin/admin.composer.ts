import type { DbClient } from '@/core/database/client';
import { createAppContainer } from '@/core/di/container';
import { createAdminComposer as createAdminComposerNew } from '@/modules/admin/admin.composer';

export interface AdminComposerOptions {
  dbClient?: DbClient | undefined;
  adminIds?: string | Set<bigint> | undefined;
}

export function createAdminComposer(options?: AdminComposerOptions) {
  const container = createAppContainer({ dbClient: options?.dbClient, child: true });
  return createAdminComposerNew({
    container,
    adminIds: options?.adminIds,
  });
}
