import type { Context } from 'grammy';
import type { DbClient } from '@/core/database/client';
import { createAppContainer } from '@/core/di/container';
import { WalletService } from '@/modules/wallet/wallet.service';
import { handleBalance as handleBalanceNew } from '@/modules/wallet/presentation/balance.handler';

export async function handleBalance(
  ctx: Context,
  dbClient?: DbClient
): Promise<void> {
  const container = createAppContainer({ dbClient, child: true });
  const walletService = container.resolve(WalletService);
  return await handleBalanceNew(ctx, walletService);
}
