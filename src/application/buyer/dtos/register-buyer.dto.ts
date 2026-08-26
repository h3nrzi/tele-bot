import type { Buyer } from '../../../domain/buyer/buyer.entity';
import type { Wallet } from '../../../domain/wallet/wallet.entity';

export interface RegisterBuyerInput {
  telegramChatId: bigint | number;
  telegramUsername?: string | null;
}

export interface RegisterBuyerResult {
  buyer: Buyer;
  wallet: Wallet;
  isNew: boolean;
}
