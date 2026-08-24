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
