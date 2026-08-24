import { eq } from 'drizzle-orm';
import type { DbClient } from '../db/client';
import { createDatabaseConnection } from '../db/client';
import { users, type User } from '../db/schema/users';
import { wallets, type Wallet } from '../db/schema/wallets';

export interface RegisterBuyerInput {
  telegramChatId: bigint | number;
  telegramUsername?: string | null;
}

export interface RegisterBuyerResult {
  user: User;
  wallet: Wallet;
}

/**
 * Registers a Buyer by creating a user row and a wallet row atomically in a single transaction.
 * The wallet starts with available_balance = '0.00'.
 */
export async function registerBuyer(
  input: RegisterBuyerInput,
  dbClient?: DbClient
): Promise<RegisterBuyerResult> {
  const client = dbClient ?? createDatabaseConnection().db;
  const chatId =
    typeof input.telegramChatId === 'bigint'
      ? input.telegramChatId
      : BigInt(input.telegramChatId);
  const username = input.telegramUsername ?? null;

  return await client.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        telegramChatId: chatId,
        telegramUsername: username,
      })
      .returning();

    if (!user) {
      throw new Error('Failed to create user record');
    }

    const [wallet] = await tx
      .insert(wallets)
      .values({
        userId: user.id,
        availableBalance: '0.00',
      })
      .returning();

    if (!wallet) {
      throw new Error('Failed to create wallet record');
    }

    return { user, wallet };
  });
}
