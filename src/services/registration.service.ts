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
 * Registers a Buyer by creating a Buyer row and a Wallet row atomically in a single transaction.
 * If the Buyer already exists, returns the existing Buyer and Wallet idempotently without error.
 * The Wallet starts with available_balance = '0.00'.
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
    // PostgreSQL ON CONFLICT DO NOTHING ... RETURNING returns an empty array when a conflict occurs.
    // We use a no-op ON CONFLICT DO UPDATE to ensure the existing Buyer row is returned via RETURNING *.
    const [user] = await tx
      .insert(users)
      .values({
        telegramChatId: chatId,
        telegramUsername: username,
      })
      .onConflictDoUpdate({
        target: users.telegramChatId,
        set: {
          telegramChatId: chatId,
        },
      })
      .returning();

    if (!user) {
      throw new Error('Failed to create or retrieve buyer');
    }

    // Similarly, use a no-op ON CONFLICT DO UPDATE on wallets.userId to return the existing Wallet row.
    const [wallet] = await tx
      .insert(wallets)
      .values({
        userId: user.id,
        availableBalance: '0.00',
      })
      .onConflictDoUpdate({
        target: wallets.userId,
        set: {
          userId: user.id,
        },
      })
      .returning();

    if (!wallet) {
      throw new Error('Failed to create or retrieve wallet');
    }

    return { user, wallet };
  });
}


