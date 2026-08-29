import { injectable, inject } from 'tsyringe';
import type { DbClient } from '@/core/database/client';
import { getDefaultDb } from '@/core/database/client';
import type { DbExecutor } from '@/core/database/types';
import type { Buyer } from '@/modules/buyer/buyer.entity';
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
   * Retrieves a Buyer and their associated Wallet by Telegram chat ID or user ID.
   * Returns null if the Buyer is not registered.
   */
  public async getBuyerWallet(
    input: GetBuyerWalletInput,
    executor?: DbExecutor
  ): Promise<BuyerWalletResult | null> {
    const client = executor ?? this.db ?? getDefaultDb();

    let buyer: Buyer | null = null;
    if (input.userId) {
      buyer = await this.buyerRepo.findById(input.userId, client);
    } else if (input.telegramChatId !== undefined) {
      const chatId = normalizeChatId(input.telegramChatId);
      buyer = await this.buyerRepo.findByTelegramChatId(chatId, client);
    }

    if (!buyer) {
      return null;
    }

    const wallet = await this.walletRepo.findByUserId(buyer.id, client);
    if (!wallet) {
      return null;
    }

    return { buyer, wallet };
  }
}

