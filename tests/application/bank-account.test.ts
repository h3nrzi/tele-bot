import { describe, it, expect } from 'vitest';
import { setupTestDatabase } from '../helpers/test-db';
import { bankAccounts } from '../../src/db/schema/bank-accounts';
import {
  setActiveAccount,
  getActiveAccount,
} from '../../src/application/bank-account/bank-account.service';

describe('Bank Account Service - setActiveAccount', () => {
  const { db } = setupTestDatabase();

  it('sets the first bank account as active and returns the inserted record', async () => {
    const fields = {
      cardNumber: '6037991812345678',
      cardHolderName: 'Hossein Rezaei',
      bankName: 'Melli',
      additionalNotes: 'Please transfer in IRR only',
    };

    const result = await setActiveAccount(fields, db);

    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(typeof result.id).toBe('string');
    expect(result.cardNumber).toBe('6037991812345678');
    expect(result.cardHolderName).toBe('Hossein Rezaei');
    expect(result.bankName).toBe('Melli');
    expect(result.additionalNotes).toBe('Please transfer in IRR only');
    expect(result.isActive).toBe(true);
    expect(result.createdAt).toBeInstanceOf(Date);

    // Verify row in database
    const dbRows = await db.select().from(bankAccounts);
    expect(dbRows).toHaveLength(1);
    expect(dbRows[0]?.id).toBe(result.id);
    expect(dbRows[0]?.isActive).toBe(true);
  });

  it('works when additionalNotes is undefined or null', async () => {
    const fields = {
      cardNumber: '5022291012345678',
      cardHolderName: 'Hossein Rezaei',
      bankName: 'Pasargad',
    };

    const result = await setActiveAccount(fields, db);

    expect(result.additionalNotes).toBeNull();
    expect(result.isActive).toBe(true);

    const dbRows = await db.select().from(bankAccounts);
    expect(dbRows).toHaveLength(1);
    expect(dbRows[0]?.additionalNotes).toBeNull();
  });

  it('deactivates all existing accounts and sets the new account as the only active one', async () => {
    const firstAccount = await setActiveAccount(
      {
        cardNumber: '6037991811111111',
        cardHolderName: 'First Holder',
        bankName: 'Melli',
        additionalNotes: 'Note 1',
      },
      db
    );

    const secondAccount = await setActiveAccount(
      {
        cardNumber: '5892101222222222',
        cardHolderName: 'Second Holder',
        bankName: 'Sepah',
        additionalNotes: 'Note 2',
      },
      db
    );

    expect(firstAccount.id).not.toBe(secondAccount.id);
    expect(secondAccount.isActive).toBe(true);

    // Verify database state: both rows persist, exactly one is active
    const allRows = await db
      .select()
      .from(bankAccounts)
      .orderBy(bankAccounts.createdAt);

    expect(allRows).toHaveLength(2);

    const [savedFirst, savedSecond] = allRows;
    expect(savedFirst?.id).toBe(firstAccount.id);
    expect(savedFirst?.cardNumber).toBe('6037991811111111');
    expect(savedFirst?.isActive).toBe(false);

    expect(savedSecond?.id).toBe(secondAccount.id);
    expect(savedSecond?.cardNumber).toBe('5892101222222222');
    expect(savedSecond?.isActive).toBe(true);

    const activeRows = allRows.filter((row) => row.isActive);
    expect(activeRows).toHaveLength(1);
    expect(activeRows[0]?.id).toBe(secondAccount.id);
  });

  it('handles deactivation across three sequential account creations with exactly one active at the end', async () => {
    const acc1 = await setActiveAccount(
      { cardNumber: '1111222233334444', cardHolderName: 'Card Holder 1', bankName: 'Bank 1' },
      db
    );
    const acc2 = await setActiveAccount(
      { cardNumber: '2222333344445555', cardHolderName: 'Card Holder 2', bankName: 'Bank 2' },
      db
    );
    const acc3 = await setActiveAccount(
      { cardNumber: '3333444455556666', cardHolderName: 'Card Holder 3', bankName: 'Bank 3' },
      db
    );

    const allRows = await db.select().from(bankAccounts);
    expect(allRows).toHaveLength(3);

    const activeRows = allRows.filter((r) => r.isActive);
    expect(activeRows).toHaveLength(1);
    expect(activeRows[0]?.id).toBe(acc3.id);

    const inactiveRows = allRows.filter((r) => !r.isActive);
    expect(inactiveRows).toHaveLength(2);
    expect(inactiveRows.map((r) => r.id).sort()).toEqual([acc1.id, acc2.id].sort());
  });

  it('validates 16-digit card number', async () => {
    await expect(
      setActiveAccount(
        { cardNumber: '1234', cardHolderName: 'Card Holder', bankName: 'Bank' },
        db
      )
    ).rejects.toThrow(/card number must be a 16-digit string/i);

    await expect(
      setActiveAccount(
        { cardNumber: '12345678901234567', cardHolderName: 'Card Holder', bankName: 'Bank' },
        db
      )
    ).rejects.toThrow(/card number must be a 16-digit string/i);

    await expect(
      setActiveAccount(
        { cardNumber: '60379918abcd5678', cardHolderName: 'Card Holder', bankName: 'Bank' },
        db
      )
    ).rejects.toThrow(/card number must be a 16-digit string/i);
  });

  it('validates non-empty card holder name and bank name', async () => {
    await expect(
      setActiveAccount(
        { cardNumber: '6037991812345678', cardHolderName: '   ', bankName: 'Bank' },
        db
      )
    ).rejects.toThrow(/card holder name cannot be empty/i);

    await expect(
      setActiveAccount(
        { cardNumber: '6037991812345678', cardHolderName: 'Card Holder', bankName: '   ' },
        db
      )
    ).rejects.toThrow(/bank name cannot be empty/i);
  });
});

describe('Bank Account Service - getActiveAccount', () => {
  const { db } = setupTestDatabase();

  it('returns null when the bank_accounts table is empty', async () => {
    const account = await getActiveAccount(db);
    expect(account).toBeNull();
  });

  it('returns the active bank account when one exists', async () => {
    const created = await setActiveAccount(
      {
        cardNumber: '6037991812345678',
        cardHolderName: 'Hossein Rezaei',
        bankName: 'Melli',
        additionalNotes: 'Transfer via Satna/Paya',
      },
      db
    );

    const activeAccount = await getActiveAccount(db);
    expect(activeAccount).not.toBeNull();
    expect(activeAccount?.id).toBe(created.id);
    expect(activeAccount?.cardNumber).toBe('6037991812345678');
    expect(activeAccount?.cardHolderName).toBe('Hossein Rezaei');
    expect(activeAccount?.bankName).toBe('Melli');
    expect(activeAccount?.additionalNotes).toBe('Transfer via Satna/Paya');
    expect(activeAccount?.isActive).toBe(true);
    expect(activeAccount?.createdAt).toBeInstanceOf(Date);
  });

  it('returns the newly active bank account and ignores deactivated ones', async () => {
    const first = await setActiveAccount(
      {
        cardNumber: '6037991811111111',
        cardHolderName: 'First Holder',
        bankName: 'Melli',
      },
      db
    );

    const second = await setActiveAccount(
      {
        cardNumber: '5892101222222222',
        cardHolderName: 'Second Holder',
        bankName: 'Sepah',
        additionalNotes: 'Second account notes',
      },
      db
    );

    const activeAccount = await getActiveAccount(db);
    expect(activeAccount).not.toBeNull();
    expect(activeAccount?.id).toBe(second.id);
    expect(activeAccount?.id).not.toBe(first.id);
    expect(activeAccount?.cardNumber).toBe('5892101222222222');
    expect(activeAccount?.cardHolderName).toBe('Second Holder');
    expect(activeAccount?.bankName).toBe('Sepah');
    expect(activeAccount?.additionalNotes).toBe('Second account notes');
    expect(activeAccount?.isActive).toBe(true);
  });

  it('returns null if no row has is_active = true', async () => {
    // Insert an inactive account directly
    await db.insert(bankAccounts).values({
      cardNumber: '6037991811111111',
      cardHolderName: 'Inactive Holder',
      bankName: 'Melli',
      isActive: false,
    });

    const activeAccount = await getActiveAccount(db);
    expect(activeAccount).toBeNull();
  });
});

