import type { DependencyContainer } from 'tsyringe';
import { TOKENS } from '@/core/di/tokens';
import { DrizzleTopUpRequestRepository } from '@/modules/top-up/top-up.repository';
import { TopUpService } from '@/modules/top-up/top-up.service';

export function registerTopUpModule(container: DependencyContainer): void {
  container.register(TOKENS.TopUpRepository, {
    useClass: DrizzleTopUpRequestRepository,
  });
  container.register(TOKENS.TopUpService, {
    useClass: TopUpService,
  });
}
