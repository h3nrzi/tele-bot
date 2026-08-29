import type { DependencyContainer } from 'tsyringe';
import { TOKENS } from '@/core/di/tokens';
import { DrizzleLedgerRepository } from '@/modules/ledger/ledger.repository';
import { LedgerService } from '@/modules/ledger/ledger.service';

export function registerLedgerModule(container: DependencyContainer): void {
  container.register(TOKENS.LedgerRepository, {
    useClass: DrizzleLedgerRepository,
  });
  container.register(TOKENS.LedgerService, {
    useClass: LedgerService,
  });
  container.register(LedgerService, {
    useClass: LedgerService,
  });
}
