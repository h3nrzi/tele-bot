import type { DependencyContainer } from 'tsyringe';
import { TOKENS } from '@/core/di/tokens';
import { DrizzleLedgerRepository } from '@/modules/ledger/ledger.repository';

export function registerLedgerModule(container: DependencyContainer): void {
  container.register(TOKENS.LedgerRepository, {
    useClass: DrizzleLedgerRepository,
  });
}
