import { injectable, inject } from 'tsyringe';
import type { DbClient } from '@/core/database/client';
import { getDefaultDb } from '@/core/database/client';
import type { DbExecutor } from '@/core/database/types';
import type { IBuyerRepository } from '@/modules/buyer/buyer.repository.interface';
import type { IWalletRepository } from '@/modules/wallet/wallet.repository.interface';
import { normalizeChatId } from '@/core/shared/telegram.utils';
import type {
  RegisterBuyerInput,
  RegisterBuyerResult,
} from '@/modules/buyer/dtos/register-buyer.dto';
import { TOKENS } from '@/core/di/tokens';

@injectable()
export class BuyerService {
  constructor(
    @inject(TOKENS.DbClient) private readonly db: DbClient,
    @inject(TOKENS.BuyerRepository) private readonly buyerRepo: IBuyerRepository<DbExecutor>,
    @inject(TOKENS.WalletRepository) private readonly walletRepo: IWalletRepository<DbExecutor>
  ) {}

  /**
   * Registers a Buyer by creating or retrieving a Buyer and their associated Wallet atomically.
   * If the Buyer already exists, returns the existing Buyer and Wallet idempotently without error.
   */
  public async register(
    input: RegisterBuyerInput,
    executor?: DbExecutor
  ): Promise<RegisterBuyerResult> {
    const client = (executor ?? this.db ?? getDefaultDb()) as DbClient;
    const chatId = normalizeChatId(input.telegramChatId);
    const username = input.telegramUsername ?? null;

    // Check if client has .transaction method
    if ('transaction' in client && typeof client.transaction === 'function') {
      return await client.transaction(async (tx) => {
        return await this.performRegistration(chatId, username, tx);
      });
    }

    return await this.performRegistration(chatId, username, client);
  }

  private async performRegistration(
    chatId: bigint,
    username: string | null,
    tx: DbExecutor
  ): Promise<RegisterBuyerResult> {
    // 1. Check if buyer already exists
    const existingBuyer = await this.buyerRepo.findByTelegramChatId(chatId, tx);
    if (existingBuyer) {
      const existingWallet = await this.walletRepo.findByUserId(existingBuyer.id, tx);
      if (existingWallet) {
        if (existingBuyer.telegramUsername !== username) {
          const { buyer } = await this.buyerRepo.upsert(
            {
              telegramChatId: chatId,
              telegramUsername: username,
            },
            tx
          );
          return {
            buyer,
            wallet: existingWallet,
            isNew: false,
          };
        }
        return {
          buyer: existingBuyer,
          wallet: existingWallet,
          isNew: false,
        };
      }
    }

    // 2. Upsert buyer
    const { buyer, isInserted } = await this.buyerRepo.upsert(
      {
        telegramChatId: chatId,
        telegramUsername: username,
      },
      tx
    );

    // 3. Upsert wallet
    const wallet = await this.walletRepo.upsert(buyer.id, '0.00', tx);

    return {
      buyer,
      wallet,
      isNew: isInserted,
    };
  }

  /**
   * Alias for register to satisfy callers expecting registerBuyer.
   */
  public async registerBuyer(
    input: RegisterBuyerInput,
    executor?: DbExecutor
  ): Promise<RegisterBuyerResult> {
    return await this.register(input, executor);
  }
}

