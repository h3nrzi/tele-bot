import type { DependencyContainer } from 'tsyringe';
import { TOKENS } from '@/core/di/tokens';
import { DrizzleExchangeRateRepository } from '@/modules/exchange-rate/exchange-rate.repository';
import { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import { DrizzleExchangeRateConfigRepository } from '@/modules/exchange-rate/exchange-rate-config.repository';
import { ExchangeRateConfigService } from '@/modules/exchange-rate/exchange-rate-config.service';
import { BaselineRateSyncWorker } from '@/modules/exchange-rate/baseline-rate-sync.worker';
import { ManualRateLock } from '@/modules/exchange-rate/manual-rate-lock.service';

export function registerExchangeRateModule(container: DependencyContainer): void {
  container.register(TOKENS.ExchangeRateRepository, {
    useClass: DrizzleExchangeRateRepository,
  });
  container.register(TOKENS.ExchangeRateService, {
    useClass: ExchangeRateService,
  });
  container.register(TOKENS.ExchangeRateConfigRepository, {
    useClass: DrizzleExchangeRateConfigRepository,
  });
  container.register(TOKENS.ExchangeRateConfigService, {
    useClass: ExchangeRateConfigService,
  });
  container.registerSingleton(TOKENS.BaselineRateSyncWorker, BaselineRateSyncWorker);
  container.register(BaselineRateSyncWorker, {
    useToken: TOKENS.BaselineRateSyncWorker,
  });
  container.register(TOKENS.ManualRateLock, {
    useClass: ManualRateLock,
  });
  container.register(ManualRateLock, {
    useToken: TOKENS.ManualRateLock,
  });
}
