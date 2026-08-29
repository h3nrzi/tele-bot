import type { Buyer } from '@/modules/buyer/buyer.entity';
import type { Wallet } from '@/modules/wallet/wallet.entity';

export interface GetBuyerWalletInput {
  telegramChatId?: bigint | number;
  userId?: string;
}

export interface BuyerWalletResult {
  buyer: Buyer;
  wallet: Wallet;
}
