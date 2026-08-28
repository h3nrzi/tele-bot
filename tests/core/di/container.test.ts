import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { createAppContainer } from '@/core/di/container';
import { TOKENS } from '@/core/di/tokens';
import { BuyerService } from '@/modules/buyer/buyer.service';
import { WalletService } from '@/modules/wallet/wallet.service';
import { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import { BankAccountService } from '@/modules/bank-account/bank-account.service';
import { TopUpService } from '@/modules/top-up/top-up.service';
import { TopUpLimits } from '@/modules/top-up/top-up.limits.vo';
import type { IBuyerRepository } from '@/modules/buyer/buyer.repository.interface';
import type { IWalletRepository } from '@/modules/wallet/wallet.repository.interface';
import type { IExchangeRateRepository } from '@/modules/exchange-rate/exchange-rate.repository.interface';
import type { IBankAccountRepository } from '@/modules/bank-account/bank-account.repository.interface';
import type { ILedgerRepository } from '@/modules/ledger/ledger.repository.interface';
import type { ITopUpRequestRepository } from '@/modules/top-up/top-up.repository.interface';

describe('Dependency Injection Container', () => {
  it('creates a child container with all domain modules registered', () => {
    const mockLimits = new TopUpLimits('5.00', '500.00', 30);
    const mockDb: any = {};

    const container = createAppContainer({
      dbClient: mockDb,
      topUpLimits: mockLimits,
      child: true,
    });

    // Verify Repository token resolutions
    expect(container.resolve<IBuyerRepository>(TOKENS.BuyerRepository)).toBeDefined();
    expect(container.resolve<IWalletRepository>(TOKENS.WalletRepository)).toBeDefined();
    expect(container.resolve<IExchangeRateRepository>(TOKENS.ExchangeRateRepository)).toBeDefined();
    expect(container.resolve<IBankAccountRepository>(TOKENS.BankAccountRepository)).toBeDefined();
    expect(container.resolve<ILedgerRepository>(TOKENS.LedgerRepository)).toBeDefined();
    expect(container.resolve<ITopUpRequestRepository>(TOKENS.TopUpRepository)).toBeDefined();

    // Verify Service class resolutions
    const buyerService = container.resolve(BuyerService);
    expect(buyerService).toBeInstanceOf(BuyerService);

    const walletService = container.resolve(WalletService);
    expect(walletService).toBeInstanceOf(WalletService);

    const exchangeRateService = container.resolve(ExchangeRateService);
    expect(exchangeRateService).toBeInstanceOf(ExchangeRateService);

    const bankAccountService = container.resolve(BankAccountService);
    expect(bankAccountService).toBeInstanceOf(BankAccountService);

    const topUpService = container.resolve(TopUpService);
    expect(topUpService).toBeInstanceOf(TopUpService);
  });
});
