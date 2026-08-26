import type { DbClient } from '../../db/client';
import { getDefaultDb } from '../../db/client';
import { buyerRepository } from '../../infrastructure/repositories/drizzle-buyer.repository';
import { walletRepository } from '../../infrastructure/repositories/drizzle-wallet.repository';
import { normalizeChatId } from '../../utils/telegram';
import type {
  GetBuyerWalletInput,
  BuyerWalletResult,
} from './dtos/get-buyer-wallet.dto';

/**
 * Retrieves a Buyer and their associated Wallet by Telegram chat ID.
 * Returns null if the Buyer is not registered.
 */
export async function getBuyerWallet(
  input: GetBuyerWalletInput,
  dbClient?: DbClient
): Promise<BuyerWalletResult | null> {
  const client = dbClient ?? getDefaultDb();
  const chatId = normalizeChatId(input.telegramChatId);

  const buyer = await buyerRepository.findByTelegramChatId(chatId, client);
  if (!buyer) {
    return null;
  }

  const wallet = await walletRepository.findByUserId(buyer.id, client);
  if (!wallet) {
    throw new Error('Failed to retrieve wallet for existing buyer');
  }

  return { buyer, wallet };
}
