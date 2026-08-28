import { createAppContainer } from '@/core/di/container';
import { WalletService } from '@/modules/wallet/wallet.service';
import type { GetBuyerWalletInput, BuyerWalletResult } from '@/modules/wallet/dtos/get-buyer-wallet.dto';
import type { DbClient } from '@/core/database/client';

export * from '@/modules/wallet/dtos/get-buyer-wallet.dto';

export async function getBuyerWallet(
  input: GetBuyerWalletInput,
  dbClient?: DbClient
): Promise<BuyerWalletResult | null> {
  const container = createAppContainer({ dbClient, child: true });
  const walletService = container.resolve(WalletService);
  return await walletService.getBuyerWallet(input, dbClient);
}
