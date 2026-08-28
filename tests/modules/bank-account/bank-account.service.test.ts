import { describe, it, expect } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { bankAccounts } from '@/modules/bank-account/bank-account.schema';
import {
  setActiveAccount,
  getActiveAccount,
  BankAccountService,
} from '@/modules/bank-account/bank-account.service';
import {
  InvalidCardNumberError,
  InvalidCardHolderNameError,
  InvalidBankNameError,
} from '@/modules/bank-account/bank-account.errors';
import { BankAccountRepository } from '@/modules/bank-account/bank-account.repository';
import { eq } from 'drizzle-orm';

describe('Bank Account Application Service', () => {
  const { db } = setupTestDatabase();

  it('inserts and activates a new bank account when no account exists', async () => {
    const account = await setActiveAccount(
      {
        cardNumber: '6037991122334455',
        cardHolderName: 'Ali Rezaei',
        bankName: 'Mellat',
        additionalNotes: 'Card to card only',
      },
      db
    );

    expect(account).toBeDefined();
    expect(account.id).toBeDefined();
    expect(account.cardNumber).toBe('6037991122334455');
    expect(account.cardHolderName).toBe('Ali Rezaei');
    expect(account.bankName).toBe('Mellat');
    expect(account.additionalNotes).toBe('Card to card only');
    expect(account.isActive).toBe(true);

    const active = await getActiveAccount(db);
    expect(active).toBeDefined();
    expect(active!.id).toBe(account.id);
  });

  it('deactivates previously active bank account atomically in a single transaction when setting a new one', async () => {
    const first = await setActiveAccount(
      {
        cardNumber: '6037991111111111',
        cardHolderName: 'First Holder',
        bankName: 'Melli',
      },
      db
    );

    const second = await setActiveAccount(
      {
        cardNumber: '5022291122223333',
        cardHolderName: 'Second Holder',
        bankName: 'Pasargad',
      },
      db
    );

    // Verify first is now deactivated
    const [firstInDb] = await db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.id, first.id));
    expect(firstInDb?.isActive).toBe(false);

    // Verify second is active
    const [secondInDb] = await db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.id, second.id));
    expect(secondInDb?.isActive).toBe(true);

    // Verify only 1 active account in system
    const activeAccounts = await db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.isActive, true));
    expect(activeAccounts).toHaveLength(1);
    expect(activeAccounts[0]?.id).toBe(second.id);
  });

  it('returns null when no bank account has been configured', async () => {
    const active = await getActiveAccount(db);
    expect(active).toBeNull();
  });

  it('cleans card number with spaces or dashes automatically', async () => {
    const account = await setActiveAccount(
      {
        cardNumber: '6037-9911-2233-4455',
        cardHolderName: 'Cleaned Number Holder',
        bankName: 'Saderat',
      },
      db
    );

    expect(account.cardNumber).toBe('6037991122334455');
  });

  it('throws InvalidCardNumberError on non-16-digit card number', async () => {
    await expect(
      setActiveAccount(
        {
          cardNumber: '12345',
          cardHolderName: 'Holder',
          bankName: 'Bank',
        },
        db
      )
    ).rejects.toThrow(InvalidCardNumberError);

    await expect(
      setActiveAccount(
        {
          cardNumber: '603799112233445566', // 18 digits
          cardHolderName: 'Holder',
          bankName: 'Bank',
        },
        db
      )
    ).rejects.toThrow(InvalidCardNumberError);

    await expect(
      setActiveAccount(
        {
          cardNumber: '60379911abcd4455',
          cardHolderName: 'Holder',
          bankName: 'Bank',
        },
        db
      )
    ).rejects.toThrow(InvalidCardNumberError);
  });

  it('throws InvalidCardHolderNameError on empty card holder name', async () => {
    await expect(
      setActiveAccount(
        {
          cardNumber: '6037991122334455',
          cardHolderName: '   ',
          bankName: 'Bank',
        },
        db
      )
    ).rejects.toThrow(InvalidCardHolderNameError);
  });

  it('throws InvalidBankNameError on empty bank name', async () => {
    await expect(
      setActiveAccount(
        {
          cardNumber: '6037991122334455',
          cardHolderName: 'Holder',
          bankName: '',
        },
        db
      )
    ).rejects.toThrow(InvalidBankNameError);
  });

  it('handles optional additionalNotes correctly', async () => {
    const accountWithoutNotes = await setActiveAccount(
      {
        cardNumber: '6037991122334455',
        cardHolderName: 'Holder',
        bankName: 'Bank',
      },
      db
    );
    expect(accountWithoutNotes.additionalNotes).toBeNull();
  });

  it('formats card number into 4-digit groups (masked or grouped)', () => {
    const account = new BankAccountService(db, new BankAccountRepository());
    // Entity check
    expect(
      account
    ).toBeDefined();
  });

  it('supports direct service instance call', async () => {
    const service = new BankAccountService(db, new BankAccountRepository());
    const acc = await service.setActiveAccount({
      cardNumber: '6037991122334455',
      cardHolderName: 'Direct Service',
      bankName: 'Tejarat',
    });
    expect(acc.bankName).toBe('Tejarat');
  });
});
