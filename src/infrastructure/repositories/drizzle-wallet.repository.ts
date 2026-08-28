import { DrizzleWalletRepository } from '@/modules/wallet/wallet.repository';

export { DrizzleWalletRepository };
export const walletRepository = new DrizzleWalletRepository();
