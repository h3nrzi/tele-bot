import { describe, it, expect } from 'vitest';
import { Wallet } from '@/modules/wallet/wallet.entity';
import { UsdAmount } from '@/core/shared/money.vo';

describe('Domain Entity: Wallet', () => {
  it('creates Wallet entity with available balance and updatedAt', () => {
    const wallet = new Wallet({
      id: 'wallet-1',
      userId: 'user-1',
      availableBalance: '0.00',
      updatedAt: new Date(),
    });

    expect(wallet.id).toBe('wallet-1');
    expect(wallet.userId).toBe('user-1');
    expect(wallet.availableBalance).toBe('0.00');
    expect(wallet.availableBalanceVo.format()).toBe('$0.00');
  });

  it('credits balance accurately and returns new UsdAmount balance', () => {
    const original = new Wallet({
      id: 'wallet-1',
      userId: 'user-1',
      availableBalance: '10.50',
      updatedAt: new Date(),
    });

    const newBalance = original.credit(new UsdAmount('20.25'));

    expect(original.id).toBe('wallet-1');
    expect(original.userId).toBe('user-1');
    expect(original.availableBalance).toBe('30.75');
    expect(newBalance.format()).toBe('$30.75');
  });

  it('credits balance when passing string or number amounts', () => {
    const wallet = new Wallet({
      id: 'wallet-1',
      userId: 'user-1',
      availableBalance: '0.00',
      updatedAt: new Date(),
    });

    wallet.credit('50.00');
    expect(wallet.availableBalance).toBe('50.00');

    wallet.credit('25.50');
    expect(wallet.availableBalance).toBe('75.50');
  });

  it('checks sufficient balance correctly', () => {
    const wallet = new Wallet({
      id: 'wallet-1',
      userId: 'user-1',
      availableBalance: '50.00',
      updatedAt: new Date(),
    });

    expect(wallet.hasSufficientBalance('50.00')).toBe(true);
    expect(wallet.hasSufficientBalance('30.00')).toBe(true);
    expect(wallet.hasSufficientBalance('50.01')).toBe(false);
  });
});
