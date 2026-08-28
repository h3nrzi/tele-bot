import { describe, it, expect } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { users } from '@/modules/buyer/buyer.schema';
import { wallets } from '@/modules/wallet/wallet.schema';
import { BuyerService } from '@/modules/buyer/buyer.service';
import { registerBuyer } from '@/modules/buyer/buyer.service';
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
    expect(result.buyer).toBeDefined();
    expect(result.wallet).toBeDefined();
    expect(result.isNew).toBe(true);
    expect(result.buyer.telegramChatId).toBe(987654321n);
    expect(result.buyer.telegramUsername).toBe('newbuyer');
    expect(result.wallet.userId).toBe(result.buyer.id);
    expect(result.wallet.availableBalance).toBe('0.00');

    // Verify in database
    const dbUsers = await db.select().from(users).where(eq(users.id, result.buyer.id));
    expect(dbUsers).toHaveLength(1);
    expect(dbUsers[0]?.telegramChatId).toBe(987654321n);
    expect(dbUsers[0]?.telegramUsername).toBe('newbuyer');

    const dbWallets = await db.select().from(wallets).where(eq(wallets.userId, result.buyer.id));
    expect(dbWallets).toHaveLength(1);
    expect(dbWallets[0]?.availableBalance).toBe('0.00');
  });

  it('returns existing buyer and wallet if user already registered (idempotent)', async () => {
    const firstResult = await registerBuyer(
      {
        telegramChatId: 112233445n,
        telegramUsername: 'idempotent_user',
      },
      db
    );
    expect(firstResult.isNew).toBe(true);

    const secondResult = await registerBuyer(
      {
        telegramChatId: 112233445n,
        telegramUsername: 'idempotent_user_updated',
      },
      db
    );

    expect(secondResult.isNew).toBe(false);
    expect(secondResult.buyer.id).toBe(firstResult.buyer.id);
    expect(secondResult.buyer.telegramChatId).toBe(112233445n);
    expect(secondResult.buyer.telegramUsername).toBe('idempotent_user_updated');
    expect(secondResult.wallet.id).toBe(firstResult.wallet.id);

    // Verify exactly 1 user and 1 wallet exist
    const dbUsers = await db
      .select()
      .from(users)
      .where(eq(users.telegramChatId, 112233445n));
    expect(dbUsers).toHaveLength(1);

    const dbWallets = await db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, firstResult.buyer.id));
    expect(dbWallets).toHaveLength(1);
  });

  it('handles null telegram_username safely', async () => {
    const result = await registerBuyer(
      {
        telegramChatId: 999888777n,
        telegramUsername: null,
      },
      db
    );

    expect(result.buyer.telegramUsername).toBeNull();

    const dbUsers = await db
      .select()
      .from(users)
      .where(eq(users.id, result.buyer.id));
    expect(dbUsers[0]?.telegramUsername).toBeNull();
  });

  it('updates existing buyer username if it changes on re-registration', async () => {
    const initial = await registerBuyer(
      {
        telegramChatId: 444555666n,
        telegramUsername: 'old_username',
      },
      db
    );
    expect(initial.buyer.telegramUsername).toBe('old_username');

    const updated = await registerBuyer(
      {
        telegramChatId: 444555666n,
        telegramUsername: 'new_username',
      },
      db
    );
    expect(updated.isNew).toBe(false);
    expect(updated.buyer.telegramUsername).toBe('new_username');

    const dbUsers = await db
      .select()
      .from(users)
      .where(eq(users.id, initial.buyer.id));
    expect(dbUsers[0]?.telegramUsername).toBe('new_username');
  });

  it('converts number telegramChatId to bigint correctly', async () => {
    const result = await registerBuyer(
      {
        telegramChatId: 123456789,
        telegramUsername: 'number_id_user',
      },
      db
    );
    expect(result.buyer.telegramChatId).toBe(123456789n);
  });
});
