import type { DependencyContainer } from 'tsyringe';
import { TOKENS } from '@/core/di/tokens';
import { DrizzleExchangeRateRepository } from '@/modules/exchange-rate/exchange-rate.repository';
import { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';

export function registerExchangeRateModule(container: DependencyContainer): void {
  container.register(TOKENS.ExchangeRateRepository, {
    useClass: DrizzleExchangeRateRepository,
  });
  container.register(TOKENS.ExchangeRateService, {
    useClass: ExchangeRateService,
  });
}
