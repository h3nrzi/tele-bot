import { eq } from 'drizzle-orm';
import { bankAccounts } from '@/db/schema/bank-accounts';
import { getDefaultDb } from '@/db/client';
import type { DbExecutor } from '@/infrastructure/db/types';
import { BankAccount } from '@/domain/bank-account/bank-account.entity';
import type { IBankAccountRepository } from '@/domain/bank-account/bank-account.repository';

export class DrizzleBankAccountRepository
  implements IBankAccountRepository<DbExecutor>
{
  private getDb(executor?: DbExecutor): DbExecutor {
    return executor ?? getDefaultDb();
  }

  public async findActive(executor?: DbExecutor): Promise<BankAccount | null> {
    const db = this.getDb(executor);
    const [row] = await db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.isActive, true))
      .limit(1);

    if (!row) {
      return null;
    }

    return new BankAccount({
      id: row.id,
      cardNumber: row.cardNumber,
      cardHolderName: row.cardHolderName,
      bankName: row.bankName,
      additionalNotes: row.additionalNotes,
      isActive: row.isActive,
      createdAt: row.createdAt,
    });
  }

  public async deactivateAll(executor?: DbExecutor): Promise<void> {
    const db = this.getDb(executor);
    await db.update(bankAccounts).set({ isActive: false });
  }

  public async insert(
    data: {
      cardNumber: string;
      cardHolderName: string;
      bankName: string;
      additionalNotes?: string | null;
      isActive: boolean;
    },
    executor?: DbExecutor
  ): Promise<BankAccount> {
    const db = this.getDb(executor);
    const [row] = await db
      .insert(bankAccounts)
      .values({
        cardNumber: data.cardNumber,
        cardHolderName: data.cardHolderName,
        bankName: data.bankName,
        additionalNotes: data.additionalNotes ?? null,
        isActive: data.isActive,
      })
      .returning();

    if (!row) {
      throw new Error('Failed to insert bank account');
    }

    return new BankAccount({
      id: row.id,
      cardNumber: row.cardNumber,
      cardHolderName: row.cardHolderName,
      bankName: row.bankName,
      additionalNotes: row.additionalNotes,
      isActive: row.isActive,
      createdAt: row.createdAt,
    });
  }
}

export const bankAccountRepository = new DrizzleBankAccountRepository();
