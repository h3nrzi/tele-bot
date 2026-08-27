import { describe, it, expect } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { users } from '@/db/schema/users';
import { wallets } from '@/db/schema/wallets';
import { registerBuyer } from '@/application/buyer/registration.service';
import { getBuyerWallet } from '@/application/wallet/wallet.service';
import { eq } from 'drizzle-orm';

describe('Wallet Service - getBuyerWallet', () => {
  const { db } = setupTestDatabase();

  it('returns null if the Buyer is not registered', async () => {
    const result = await getBuyerWallet(
      {
        telegramChatId: 999999999n,
      },
      db
    );

    expect(result).toBeNull();
  });

  it('returns Buyer and Wallet for an existing registered Buyer', async () => {
    const chatId = 123456789n;
    const registered = await registerBuyer(
      {
        telegramChatId: chatId,
        telegramUsername: 'testbuyer',
      },
      db
    );

    const result = await getBuyerWallet(
      {
        telegramChatId: chatId,
      },
      db
    );

    expect(result).not.toBeNull();
    expect(result?.buyer.id).toBe(registered.buyer.id);
    expect(result?.buyer.telegramChatId).toBe(chatId);
    expect(result?.wallet.id).toBe(registered.wallet.id);
    expect(result?.wallet.availableBalance).toBe('0.00');
  });

  it('reflects updated availableBalance for a Buyer', async () => {
    const chatId = 456789012n;
    const registered = await registerBuyer(
      {
        telegramChatId: chatId,
      },
      db
    );

    await db
      .update(wallets)
      .set({ availableBalance: '250.00' })
      .where(eq(wallets.userId, registered.buyer.id));

    const result = await getBuyerWallet(
      {
        telegramChatId: chatId,
      },
      db
    );

    expect(result).not.toBeNull();
    expect(result?.wallet.availableBalance).toBe('250.00');
  });

  it('accepts number type for telegramChatId', async () => {
    const chatIdNum = 789123456;
    await registerBuyer(
      {
        telegramChatId: chatIdNum,
      },
      db
    );

    const result = await getBuyerWallet(
      {
        telegramChatId: chatIdNum,
      },
      db
    );

    expect(result).not.toBeNull();
    expect(result?.buyer.telegramChatId).toBe(BigInt(chatIdNum));
  });
});
