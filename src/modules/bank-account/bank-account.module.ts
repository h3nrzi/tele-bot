import type { DependencyContainer } from 'tsyringe';
import { TOKENS } from '@/core/di/tokens';
import { DrizzleBankAccountRepository } from '@/modules/bank-account/bank-account.repository';
import { BankAccountService } from '@/modules/bank-account/bank-account.service';

export function registerBankAccountModule(container: DependencyContainer): void {
  container.register(TOKENS.BankAccountRepository, {
    useClass: DrizzleBankAccountRepository,
  });
  container.register(TOKENS.BankAccountService, {
    useClass: BankAccountService,
  });
}
