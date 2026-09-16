import type { DependencyContainer } from "tsyringe";
import { TOKENS } from "@/core/di/tokens";
import { DrizzleOtcPurchaseRepository } from "./otc-purchase.repository";
import { OtcPurchaseService } from "./otc-purchase.service";

export function registerOtcPurchaseModule(container: DependencyContainer): void {
	container.register(TOKENS.OtcPurchaseRepository, {
		useClass: DrizzleOtcPurchaseRepository,
	});
	container.register(TOKENS.OtcPurchaseService, {
		useClass: OtcPurchaseService,
	});
}
