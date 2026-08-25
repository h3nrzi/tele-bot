import { eq } from 'drizzle-orm';
import type { DbClient } from '../db/client';
import { getDefaultDb } from '../db/client';
import { bankAccounts, type BankAccount } from '../db/schema/bank-accounts';

export interface SetActiveAccountInput {
  cardNumber: string;
  cardHolderName: string;
  bankName: string;
  additionalNotes?: string | null;
}

/**
 * Sets a new active bank account within a single transaction:
 * 1. Sets is_active = false on all existing bank account rows.
 * 2. Inserts a new bank account row with is_active = true.
 * At commit, exactly one row has is_active = true.
 */
export async function setActiveAccount(
  input: SetActiveAccountInput,
  dbClient?: DbClient
): Promise<BankAccount> {
  const client = dbClient ?? getDefaultDb();

  const cardNumber = input.cardNumber?.trim();
  if (!cardNumber || !/^\d{16}$/.test(cardNumber)) {
    throw new Error('Card number must be a 16-digit string');
  }

  const cardHolderName = input.cardHolderName?.trim();
  if (!cardHolderName) {
    throw new Error('Card holder name cannot be empty');
  }

  const bankName = input.bankName?.trim();
  if (!bankName) {
    throw new Error('Bank name cannot be empty');
  }

  const additionalNotes = input.additionalNotes?.trim() || null;

  return await client.transaction(async (tx) => {
    // 1. Deactivate all existing rows
    await tx.update(bankAccounts).set({ isActive: false });

    // 2. Insert new active account
    const [insertedAccount] = await tx
      .insert(bankAccounts)
      .values({
        cardNumber,
        cardHolderName,
        bankName,
        additionalNotes,
        isActive: true,
      })
      .returning();

    if (!insertedAccount) {
      throw new Error('Failed to insert active bank account');
    }

    return insertedAccount;
  });
}

/**
 * Returns the single active bank account row where is_active = true,
 * or null if no active account exists.
 */
export async function getActiveAccount(
  dbClient?: DbClient
): Promise<BankAccount | null> {
  const client = dbClient ?? getDefaultDb();

  const [activeAccount] = await client
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.isActive, true))
    .limit(1);

  return activeAccount ?? null;
}

