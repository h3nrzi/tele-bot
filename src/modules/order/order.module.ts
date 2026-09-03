import type { DependencyContainer } from 'tsyringe';
import { TOKENS } from '@/core/di/tokens';
import { DrizzleOrderRepository } from '@/modules/order/order.repository';
import { OrderService } from '@/modules/order/order.service';

/**
 * Registers Order repository and application service into the DI container.
 */
export function registerOrderModule(container: DependencyContainer): void {
  container.register(TOKENS.OrderRepository, {
    useClass: DrizzleOrderRepository,
  });

  container.register(TOKENS.OrderService, {
    useClass: OrderService,
  });
}
