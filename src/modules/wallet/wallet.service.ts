import { injectable, inject } from 'tsyringe';
import type { DbClient } from '@/core/database/client';
import { getDefaultDb } from '@/core/database/client';
import type { DbExecutor } from '@/core/database/types';
import type { IBuyerRepository } from '@/modules/buyer/buyer.repository.interface';
import type { IWalletRepository } from '@/modules/wallet/wallet.repository.interface';
import { normalizeChatId } from '@/core/shared/telegram.utils';
import type {
  GetBuyerWalletInput,
  BuyerWalletResult,
} from '@/modules/wallet/dtos/get-buyer-wallet.dto';
import { TOKENS } from '@/core/di/tokens';

@injectable()
export class WalletService {
  constructor(
    @inject(TOKENS.DbClient) private readonly db: DbClient,
    @inject(TOKENS.BuyerRepository) private readonly buyerRepo: IBuyerRepository<DbExecutor>,
    @inject(TOKENS.WalletRepository) private readonly walletRepo: IWalletRepository<DbExecutor>
  ) {}

  /**
   * Retrieves a Buyer and their associated Wallet by Telegram chat ID.
   * Returns null if the Buyer is not registered.
   */
  public async getBuyerWallet(
    input: GetBuyerWalletInput,
    executor?: DbExecutor
  ): Promise<BuyerWalletResult | null> {
    const client = executor ?? this.db ?? getDefaultDb();
    const chatId = normalizeChatId(input.telegramChatId);

    const buyer = await this.buyerRepo.findByTelegramChatId(chatId, client);
    if (!buyer) {
      return null;
    }

    const wallet = await this.walletRepo.findByUserId(buyer.id, client);
    if (!wallet) {
      throw new Error('Failed to retrieve wallet for existing buyer');
    }

    return { buyer, wallet };
  }
}

import { BuyerRepository } from '@/modules/buyer/buyer.repository';
import { WalletRepository } from '@/modules/wallet/wallet.repository';

export async function getBuyerWallet(
  input: GetBuyerWalletInput | { userId: string } | { telegramChatId: bigint | number },
  executor?: DbExecutor
): Promise<BuyerWalletResult | null> {
  const service = new WalletService(
    executor as DbClient,
    new BuyerRepository(),
    new WalletRepository()
  );
  if ('userId' in input) {
    const client = executor ?? getDefaultDb();
    const buyerRepo = new BuyerRepository();
    const walletRepo = new WalletRepository();
    const buyer = await buyerRepo.findById(input.userId, client);
    if (!buyer) return null;
    const wallet = await walletRepo.findByUserId(buyer.id, client);
    if (!wallet) return null;
    return { buyer, wallet };
  }
  return await service.getBuyerWallet(input as GetBuyerWalletInput, executor);
}

