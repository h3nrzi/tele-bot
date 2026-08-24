import { eq } from 'drizzle-orm';
import type { DbClient } from '../db/client';
import { createDatabaseConnection } from '../db/client';
import { users, type User } from '../db/schema/users';
import { wallets, type Wallet } from '../db/schema/wallets';

export interface GetBuyerWalletInput {
  telegramChatId: bigint | number;
}

export interface BuyerWalletResult {
  buyer: User;
  wallet: Wallet;
}

/**
 * Retrieves a Buyer and their associated Wallet by Telegram chat ID.
 * Returns null if the Buyer is not registered.
 */
export async function getBuyerWallet(
  input: GetBuyerWalletInput,
  dbClient?: DbClient
): Promise<BuyerWalletResult | null> {
  const client = dbClient ?? createDatabaseConnection().db;
  const chatId =
    typeof input.telegramChatId === 'bigint'
      ? input.telegramChatId
      : BigInt(input.telegramChatId);

  const [buyer] = await client
    .select()
    .from(users)
    .where(eq(users.telegramChatId, chatId));

  if (!buyer) {
    return null;
  }

  const [wallet] = await client
    .select()
    .from(wallets)
    .where(eq(wallets.userId, buyer.id));

  if (!wallet) {
    throw new Error('Failed to retrieve wallet for existing buyer');
  }

  return { buyer, wallet };
}
