import { describe, it, expect } from 'vitest';
import { setupTestDatabase } from './test-db';
import { users } from '../../src/db/schema/users';
import { wallets } from '../../src/db/schema/wallets';
import { eq } from 'drizzle-orm';

describe('Test Harness & Database Isolation', () => {
  const { db } = setupTestDatabase();

  it('allows inserting records into the database', async () => {
    const [insertedUser] = await db
      .insert(users)
      .values({
        telegramChatId: 111222333n,
        telegramUsername: 'testbuyer',
      })
      .returning();

    expect(insertedUser).toBeDefined();
    expect(insertedUser?.telegramChatId).toBe(111222333n);

    if (!insertedUser) throw new Error('Failed to insert user');

    const [insertedWallet] = await db
      .insert(wallets)
      .values({
        userId: insertedUser.id,
        availableBalance: '0.00',
      })
      .returning();

    expect(insertedWallet).toBeDefined();
    expect(insertedWallet?.availableBalance).toBe('0.00');

    const userCount = await db.select().from(users);
    const walletCount = await db.select().from(wallets);
    expect(userCount.length).toBe(1);
    expect(walletCount.length).toBe(1);
  });

  it('guarantees clean database state by truncating all tables between tests', async () => {
    const userCount = await db.select().from(users);
    const walletCount = await db.select().from(wallets);

    // Records from previous test must be truncated
    expect(userCount.length).toBe(0);
    expect(walletCount.length).toBe(0);
  });
});
