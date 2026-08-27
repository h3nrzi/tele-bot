import type { Buyer } from '@/domain/buyer/buyer.entity';
import type { Wallet } from '@/domain/wallet/wallet.entity';

export interface GetBuyerWalletInput {
  telegramChatId: bigint | number;
}

export interface BuyerWalletResult {
  buyer: Buyer;
  wallet: Wallet;
}
