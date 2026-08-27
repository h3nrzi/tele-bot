import type { DbClient } from '@/db/client';
import { getDefaultDb } from '@/db/client';
import { buyerRepository } from '@/infrastructure/repositories/drizzle-buyer.repository';
import { walletRepository } from '@/infrastructure/repositories/drizzle-wallet.repository';
import { normalizeChatId } from '@/utils/telegram';
import type {
  RegisterBuyerInput,
  RegisterBuyerResult,
} from '@/application/buyer/dtos/register-buyer.dto';

/**
 * Registers a Buyer by creating or retrieving a Buyer and their associated Wallet atomically.
 * If the Buyer already exists, returns the existing Buyer and Wallet idempotently without error.
 */
export async function registerBuyer(
  input: RegisterBuyerInput,
  dbClient?: DbClient
): Promise<RegisterBuyerResult> {
  const client = dbClient ?? getDefaultDb();
  const chatId = normalizeChatId(input.telegramChatId);
  const username = input.telegramUsername ?? null;

  return await client.transaction(async (tx) => {
    // 1. Check if buyer already exists
    const existingBuyer = await buyerRepository.findByTelegramChatId(chatId, tx);
    if (existingBuyer) {
      const existingWallet = await walletRepository.findByUserId(existingBuyer.id, tx);
      if (existingWallet) {
        return {
          buyer: existingBuyer,
          wallet: existingWallet,
          isNew: false,
        };
      }
    }

    // 2. Upsert buyer
    const { buyer, isInserted } = await buyerRepository.upsert(
      {
        telegramChatId: chatId,
        telegramUsername: username,
      },
      tx
    );

    // 3. Upsert wallet
    const wallet = await walletRepository.upsert(buyer.id, '0.00', tx);

    return {
      buyer,
      wallet,
      isNew: isInserted,
    };
  });
}
