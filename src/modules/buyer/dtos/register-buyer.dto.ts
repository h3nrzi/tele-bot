import type { Buyer } from '@/modules/buyer/buyer.entity';
import type { Wallet } from '@/modules/wallet/wallet.entity';

export interface RegisterBuyerInput {
  telegramChatId: bigint | number;
  telegramUsername?: string | null;
}

export interface RegisterBuyerResult {
  buyer: Buyer;
  wallet: Wallet;
  isNew: boolean;
}
