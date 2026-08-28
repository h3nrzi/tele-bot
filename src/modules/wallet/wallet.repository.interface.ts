import type { Wallet } from '@/modules/wallet/wallet.entity';
import type { UsdAmount } from '@/core/shared/money.vo';

/**
 * Domain Repository Interface for Wallet.
 */
export interface IWalletRepository<TExecutor = unknown> {
  findByUserId(userId: string, executor?: TExecutor): Promise<Wallet | null>;
  findByUserIdForUpdate(userId: string, executor: TExecutor): Promise<Wallet | null>;
  upsert(userId: string, initialBalance?: UsdAmount | string, executor?: TExecutor): Promise<Wallet>;
  updateBalance(walletId: string, newBalance: UsdAmount | string, executor?: TExecutor): Promise<Wallet>;
}
