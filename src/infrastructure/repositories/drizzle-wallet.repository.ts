import { eq } from 'drizzle-orm';
import { wallets } from '../../db/schema/wallets';
import { getDefaultDb } from '../../db/client';
import type { DbExecutor } from '../db/types';
import { Wallet } from '../../domain/wallet/wallet.entity';
import type { IWalletRepository } from '../../domain/wallet/wallet.repository';
import { UsdAmount } from '../../domain/shared/money.vo';

export class DrizzleWalletRepository implements IWalletRepository<DbExecutor> {
  private getDb(executor?: DbExecutor): DbExecutor {
    return executor ?? getDefaultDb();
  }

  public async findByUserId(
    userId: string,
    executor?: DbExecutor
  ): Promise<Wallet | null> {
    const db = this.getDb(executor);
    const [row] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId));
    if (!row) {
      return null;
    }
    return new Wallet({
      id: row.id,
      userId: row.userId,
      availableBalance: row.availableBalance,
      updatedAt: row.updatedAt,
    });
  }

  public async findByUserIdForUpdate(
    userId: string,
    executor: DbExecutor
  ): Promise<Wallet | null> {
    const [row] = await executor
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .for('update');
    if (!row) {
      return null;
    }
    return new Wallet({
      id: row.id,
      userId: row.userId,
      availableBalance: row.availableBalance,
      updatedAt: row.updatedAt,
    });
  }

  public async upsert(
    userId: string,
    initialBalance: UsdAmount | string = '0.00',
    executor?: DbExecutor
  ): Promise<Wallet> {
    const db = this.getDb(executor);
    const balanceStr =
      initialBalance instanceof UsdAmount
        ? initialBalance.toString()
        : initialBalance;

    const [row] = await db
      .insert(wallets)
      .values({
        userId,
        availableBalance: balanceStr,
      })
      .onConflictDoUpdate({
        target: wallets.userId,
        set: {
          userId,
        },
      })
      .returning();

    if (!row) {
      throw new Error('Failed to create or retrieve wallet');
    }

    return new Wallet({
      id: row.id,
      userId: row.userId,
      availableBalance: row.availableBalance,
      updatedAt: row.updatedAt,
    });
  }

  public async updateBalance(
    walletId: string,
    newBalance: UsdAmount | string,
    executor?: DbExecutor
  ): Promise<Wallet> {
    const db = this.getDb(executor);
    const balanceStr =
      newBalance instanceof UsdAmount ? newBalance.toString() : newBalance;

    const [row] = await db
      .update(wallets)
      .set({
        availableBalance: balanceStr,
        updatedAt: new Date(),
      })
      .where(eq(wallets.id, walletId))
      .returning();

    if (!row) {
      throw new Error('Failed to update wallet balance');
    }

    return new Wallet({
      id: row.id,
      userId: row.userId,
      availableBalance: row.availableBalance,
      updatedAt: row.updatedAt,
    });
  }
}

export const walletRepository = new DrizzleWalletRepository();
