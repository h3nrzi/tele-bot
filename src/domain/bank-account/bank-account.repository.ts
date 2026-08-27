import type { BankAccount } from '@/domain/bank-account/bank-account.entity';

/**
 * Domain Repository Interface for BankAccount.
 */
export interface IBankAccountRepository<TExecutor = unknown> {
  findActive(executor?: TExecutor): Promise<BankAccount | null>;
  deactivateAll(executor?: TExecutor): Promise<void>;
  insert(
    data: {
      cardNumber: string;
      cardHolderName: string;
      bankName: string;
      additionalNotes?: string | null;
      isActive: boolean;
    },
    executor?: TExecutor
  ): Promise<BankAccount>;
}
