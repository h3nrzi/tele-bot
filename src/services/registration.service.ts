import { sql } from 'drizzle-orm';
import type { DbClient } from '../db/client';
import { getDefaultDb } from '../db/client';
import { users, type Buyer } from '../db/schema/users';
import { wallets, type Wallet } from '../db/schema/wallets';
import { getBuyerWallet } from './wallet.service';
import { normalizeChatId } from '../utils/telegram';

export interface RegisterBuyerInput {
  telegramChatId: bigint | number;
  telegramUsername?: string | null;
}

export interface RegisterBuyerResult {
  buyer: Buyer;
  wallet: Wallet;
  isNew: boolean;
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
  const client = dbClient ?? getDefaultDb();
  const chatId = normalizeChatId(input.telegramChatId);
  const username = input.telegramUsername ?? null;

  return await client.transaction(async (tx) => {
    const existing = await getBuyerWallet({ telegramChatId: chatId }, tx as unknown as DbClient);
    if (existing) {
      return { buyer: existing.buyer, wallet: existing.wallet, isNew: false };
    }

    // New Buyer
    // PostgreSQL ON CONFLICT DO NOTHING ... RETURNING returns an empty array when a conflict occurs.
    // We use a no-op ON CONFLICT DO UPDATE to ensure the existing Buyer row is returned via RETURNING *.
    // In PostgreSQL, (xmax = 0) evaluates to true if the row was freshly inserted, and false if updated on conflict.
    const [insertedBuyer] = await tx
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
      .returning({
        id: users.id,
        telegramChatId: users.telegramChatId,
        telegramUsername: users.telegramUsername,
        createdAt: users.createdAt,
        isInserted: sql<boolean>`(xmax = 0)`.as('is_inserted'),
      });

    if (!insertedBuyer) {
      throw new Error('Failed to create or retrieve buyer');
    }

    const { isInserted, ...buyer } = insertedBuyer;

    // Similarly, use a no-op ON CONFLICT DO UPDATE on wallets.userId to return the existing Wallet row.
    const [wallet] = await tx
      .insert(wallets)
      .values({
        userId: buyer.id,
        availableBalance: '0.00',
      })
      .onConflictDoUpdate({
        target: wallets.userId,
        set: {
          userId: buyer.id,
        },
      })
      .returning();

    if (!wallet) {
      throw new Error('Failed to create or retrieve wallet');
    }

    return { buyer, wallet, isNew: Boolean(isInserted) };
  });
}


