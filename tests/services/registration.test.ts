import { describe, it, expect } from 'vitest';
import { setupTestDatabase } from '../helpers/test-db';
import { users } from '../../src/db/schema/users';
import { wallets } from '../../src/db/schema/wallets';
import { registerBuyer } from '../../src/services/registration.service';
import { eq } from 'drizzle-orm';

describe('Registration Service - Atomicity & Creation', () => {
  const { db } = setupTestDatabase();

  it('creates a users row and a wallets row atomically in a single transaction with available_balance = 0.00', async () => {
    const result = await registerBuyer(
      {
        telegramChatId: 987654321n,
        telegramUsername: 'newbuyer',
      },
      db
    );

    expect(result).toBeDefined();
    expect(result.user).toBeDefined();
    expect(result.wallet).toBeDefined();
    expect(result.user.telegramChatId).toBe(987654321n);
    expect(result.user.telegramUsername).toBe('newbuyer');
    expect(result.wallet.userId).toBe(result.user.id);
    expect(result.wallet.availableBalance).toBe('0.00');

    // Verify in database
    const dbUsers = await db.select().from(users).where(eq(users.id, result.user.id));
    const dbWallets = await db.select().from(wallets).where(eq(wallets.userId, result.user.id));

    expect(dbUsers.length).toBe(1);
    expect(dbWallets.length).toBe(1);
    expect(dbUsers[0]?.telegramChatId).toBe(987654321n);
    expect(dbWallets[0]?.availableBalance).toBe('0.00');
  });

  it('works when telegramUsername is not provided (null/undefined)', async () => {
    const result = await registerBuyer(
      {
        telegramChatId: 1122334455n,
      },
      db
    );

    expect(result.user.telegramChatId).toBe(1122334455n);
    expect(result.user.telegramUsername).toBeNull();
    expect(result.wallet.userId).toBe(result.user.id);
    expect(result.wallet.availableBalance).toBe('0.00');
  });
});

describe('Registration Service - Idempotency', () => {
  const { db } = setupTestDatabase();

  it('returns existing user and wallet without error or duplicate rows when called twice with the same telegram_chat_id', async () => {
    const chatId = 123456789n;

    const firstResult = await registerBuyer(
      {
        telegramChatId: chatId,
        telegramUsername: 'initial_username',
      },
      db
    );

    const secondResult = await registerBuyer(
      {
        telegramChatId: chatId,
        telegramUsername: 'updated_username',
      },
      db
    );

    expect(secondResult.user.id).toBe(firstResult.user.id);
    expect(secondResult.user.telegramUsername).toBe('initial_username');
    expect(secondResult.wallet.id).toBe(firstResult.wallet.id);
    expect(secondResult.wallet.userId).toBe(firstResult.user.id);

    // Verify no duplicates in database
    const dbUsers = await db.select().from(users).where(eq(users.telegramChatId, chatId));
    const dbWallets = await db.select().from(wallets).where(eq(wallets.userId, firstResult.user.id));

    expect(dbUsers.length).toBe(1);
    expect(dbWallets.length).toBe(1);
  });

  it('preserves existing wallet available_balance when called again for an existing buyer', async () => {
    const chatId = 555666777n;

    const firstResult = await registerBuyer(
      {
        telegramChatId: chatId,
      },
      db
    );

    // Simulate balance change on the existing wallet
    await db
      .update(wallets)
      .set({ availableBalance: '42.50' })
      .where(eq(wallets.id, firstResult.wallet.id));

    const secondResult = await registerBuyer(
      {
        telegramChatId: chatId,
      },
      db
    );

    expect(secondResult.user.id).toBe(firstResult.user.id);
    expect(secondResult.wallet.id).toBe(firstResult.wallet.id);
    expect(secondResult.wallet.availableBalance).toBe('42.50');
  });

  it('handles concurrent registrations with the same telegram_chat_id producing exactly one user and wallet', async () => {
    const chatId = 999888777n;

    const results = await Promise.all([
      registerBuyer({ telegramChatId: chatId, telegramUsername: 'concurrent1' }, db),
      registerBuyer({ telegramChatId: chatId, telegramUsername: 'concurrent2' }, db),
      registerBuyer({ telegramChatId: chatId, telegramUsername: 'concurrent3' }, db),
    ]);

    expect(results).toHaveLength(3);
    const firstId = results[0]?.user.id;
    const firstWalletId = results[0]?.wallet.id;

    for (const res of results) {
      expect(res.user.id).toBe(firstId);
      expect(res.wallet.id).toBe(firstWalletId);
    }

    const dbUsers = await db.select().from(users).where(eq(users.telegramChatId, chatId));
    const dbWallets = await db.select().from(wallets).where(eq(wallets.userId, firstId!));

    expect(dbUsers.length).toBe(1);
    expect(dbWallets.length).toBe(1);
  });
});

