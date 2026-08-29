import { injectable, inject } from 'tsyringe';
import type { DbClient } from '@/core/database/client';
import { getDefaultDb } from '@/core/database/client';
import type { DbExecutor } from '@/core/database/types';
import type { IBankAccountRepository } from '@/modules/bank-account/bank-account.repository.interface';
import { BankAccount } from '@/modules/bank-account/bank-account.entity';
import {
  InvalidCardNumberError,
  InvalidCardHolderNameError,
  InvalidBankNameError,
} from '@/modules/bank-account/bank-account.errors';
import type { SetActiveAccountInput } from '@/modules/bank-account/dtos/set-active-account.dto';
import { TOKENS } from '@/core/di/tokens';

@injectable()
export class BankAccountService {
  constructor(
    @inject(TOKENS.DbClient) private readonly db: DbClient,
    @inject(TOKENS.BankAccountRepository)
    private readonly bankAccountRepo: IBankAccountRepository<DbExecutor>
  ) {}

  /**
   * Sets a new active bank account within a single transaction:
   * 1. Sets is_active = false on all existing bank account rows.
   * 2. Inserts a new bank account row with is_active = true.
   */
  public async setActiveAccount(
    input: SetActiveAccountInput,
    executor?: DbExecutor
  ): Promise<BankAccount> {
    const client = (executor ?? this.db ?? getDefaultDb()) as DbClient;

    const cardNumber = input.cardNumber?.replace(/[\s-]/g, '').trim();
    if (!cardNumber || !/^\d{16}$/.test(cardNumber)) {
      throw new InvalidCardNumberError('Card number must be a 16-digit string');
    }

    const cardHolderName = input.cardHolderName?.trim();
    if (!cardHolderName) {
      throw new InvalidCardHolderNameError('Card holder name cannot be empty');
    }

    const bankName = input.bankName?.trim();
    if (!bankName) {
      throw new InvalidBankNameError('Bank name cannot be empty');
    }

    const additionalNotes = input.additionalNotes?.trim() || null;

    if ('transaction' in client && typeof client.transaction === 'function') {
      return await client.transaction(async (tx) => {
        await this.bankAccountRepo.deactivateAll(tx);
        return await this.bankAccountRepo.insert(
          {
            cardNumber,
            cardHolderName,
            bankName,
            additionalNotes,
            isActive: true,
          },
          tx
        );
      });
    }

    await this.bankAccountRepo.deactivateAll(client);
    return await this.bankAccountRepo.insert(
      {
        cardNumber,
        cardHolderName,
        bankName,
        additionalNotes,
        isActive: true,
      },
      client
    );
  }

  /**
   * Returns the single active bank account where is_active = true, or null if none exists.
   */
  public async getActiveAccount(
    executor?: DbExecutor
  ): Promise<BankAccount | null> {
    const client = executor ?? this.db ?? getDefaultDb();
    return await this.bankAccountRepo.findActive(client);
  }
}

