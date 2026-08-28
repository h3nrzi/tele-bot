import type { DependencyContainer } from 'tsyringe';
import { TOKENS } from '@/core/di/tokens';
import { DrizzleBuyerRepository } from '@/modules/buyer/buyer.repository';
import { BuyerService } from '@/modules/buyer/buyer.service';

export function registerBuyerModule(container: DependencyContainer): void {
  container.register(TOKENS.BuyerRepository, {
    useClass: DrizzleBuyerRepository,
  });
  container.register(TOKENS.BuyerService, {
    useClass: BuyerService,
  });
}
