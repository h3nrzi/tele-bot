import type { DependencyContainer } from "tsyringe";
import { TOKENS } from "@/core/di/tokens";
import type { WallexClient } from "./wallex.client.interface";
import { WallexHttpClient } from "./wallex.http.client";
import { WallexConfigVo, type WallexConfig } from "./wallex.config";

/**
 * Creates an instance of WallexClient.
 * If config is partially supplied or omitted, missing values are resolved from environment variables.
 */
export function createWallexClient(config?: Partial<WallexConfig>, fetchFn?: typeof fetch): WallexClient {
	const apiKey = config?.apiKey || process.env.WALLEX_API_KEY;
	if (!apiKey) {
		throw new Error("WALLEX_API_KEY environment variable is required");
	}

	const baseUrl = config?.baseUrl || process.env.WALLEX_API_BASE_URL || "https://api.wallex.ir";
	const fullConfig = new WallexConfigVo(apiKey, baseUrl);

	return new WallexHttpClient(fullConfig, fetchFn);
}

/**
 * Registers the Wallex module into the tsyringe dependency injection container.
 */
export function registerWallexModule(container: DependencyContainer): void {
	// Register WallexConfig if environment variables exist
	try {
		const config = WallexConfigVo.fromEnv();
		container.register(TOKENS.WallexConfig, { useValue: config });
	} catch {
		// WALLEX_API_KEY may not be defined in dev/test environments; allowed
	}

	// Register WallexClient factory
	container.register<WallexClient>(TOKENS.WallexClient, {
		useFactory: (c) => {
			try {
				let config: WallexConfig;
				if (c.isRegistered(TOKENS.WallexConfig)) {
					config = c.resolve<WallexConfig>(TOKENS.WallexConfig);
				} else {
					config = WallexConfigVo.fromEnv();
				}
				return new WallexHttpClient(config);
			} catch {
				return undefined as unknown as WallexClient;
			}
		},
	});
}
