import { TOKENS } from "@/core/di/tokens";
import { DrizzleOrderRepository } from "@/modules/order/order.repository";
import { OrderService } from "@/modules/order/order.service";
import type { DependencyContainer } from "tsyringe";

/**
 * Registers Order repository and application service into the DI container.
 */
export function registerOrderModule(container: DependencyContainer): void {
	container.register(TOKENS.OrderRepository, {
		useClass: DrizzleOrderRepository,
	});

	if (!container.isRegistered(TOKENS.OrderNotifier)) {
		container.register(TOKENS.OrderNotifier, {
			useFactory: () => undefined,
		});
	}

	container.register(TOKENS.OrderService, {
		useClass: OrderService,
	});
}
