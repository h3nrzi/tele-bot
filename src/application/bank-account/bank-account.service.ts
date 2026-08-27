import type { DbClient } from '@/db/client';
import { getDefaultDb } from '@/db/client';
import { bankAccountRepository } from '@/infrastructure/repositories/drizzle-bank-account.repository';
import { BankAccount } from '@/domain/bank-account/bank-account.entity';
import {
  InvalidCardNumberError,
  InvalidCardHolderNameError,
  InvalidBankNameError,
} from '@/domain/bank-account/bank-account.errors';
import type { SetActiveAccountInput } from '@/application/bank-account/dtos/set-active-account.dto';

/**
 * Sets a new active bank account within a single transaction:
 * 1. Sets is_active = false on all existing bank account rows.
 * 2. Inserts a new bank account row with is_active = true.
 */
export async function setActiveAccount(
  input: SetActiveAccountInput,
  dbClient?: DbClient
): Promise<BankAccount> {
  const client = dbClient ?? getDefaultDb();

  const cardNumber = input.cardNumber?.trim();
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

  return await client.transaction(async (tx) => {
    await bankAccountRepository.deactivateAll(tx);

    return await bankAccountRepository.insert(
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

/**
 * Returns the single active bank account where is_active = true, or null if none exists.
 */
export async function getActiveAccount(
  dbClient?: DbClient
): Promise<BankAccount | null> {
  const client = dbClient ?? getDefaultDb();
  return await bankAccountRepository.findActive(client);
}
