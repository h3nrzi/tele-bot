import { describe, it, expect } from 'vitest';
import { Wallet } from '@/domain/wallet/wallet.entity';
import { UsdAmount } from '@/domain/shared/money.vo';

describe('Wallet Aggregate Entity', () => {
  it('credits balance with exact decimal precision', () => {
    const wallet = new Wallet({
      id: 'wallet-1',
      userId: 'user-1',
      availableBalance: '10.50',
      updatedAt: new Date(),
    });

    const newBalance = wallet.credit('20.25');
    expect(newBalance.toString()).toBe('30.75');
    expect(wallet.availableBalance).toBe('30.75');
  });

  it('checks sufficient balance correctly', () => {
    const wallet = new Wallet({
      id: 'wallet-1',
      userId: 'user-1',
      availableBalance: '50.00',
      updatedAt: new Date(),
    });

    expect(wallet.hasSufficientBalance('30.00')).toBe(true);
    expect(wallet.hasSufficientBalance('50.00')).toBe(true);
    expect(wallet.hasSufficientBalance('50.01')).toBe(false);
  });

  it('throws error when attempting to credit with non-positive amount', () => {
    const wallet = new Wallet({
      id: 'wallet-1',
      userId: 'user-1',
      availableBalance: '0.00',
      updatedAt: new Date(),
    });

    expect(() => wallet.credit('0.00')).toThrow(/Credit amount must be positive/i);
    expect(() => wallet.credit('-10.00')).toThrow(/Credit amount must be positive/i);
  });
});
