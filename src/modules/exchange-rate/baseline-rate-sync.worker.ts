import { injectable, inject } from "tsyringe";
import { TOKENS } from "@/core/di/tokens";
import type { WallexClient } from "@/modules/wallex/wallex.client.interface";
import type { ExchangeRateService } from "@/modules/exchange-rate/exchange-rate.service";
import type { ExchangeRateConfigService } from "@/modules/exchange-rate/exchange-rate-config.service";
import type { ExchangeRate } from "@/modules/exchange-rate/exchange-rate.entity";
import { normalizeChatId, parseBotIdFromToken } from "@/core/shared/telegram.utils";

export interface SyncLogger {
	log?: (...args: any[]) => void;
	error: (...args: any[]) => void;
	info?: (...args: any[]) => void;
	warn?: (...args: any[]) => void;
}

export interface SyncBaselineRateDependencies {
	wallexClient: WallexClient;
	exchangeRateService: ExchangeRateService;
	botTelegramId: bigint | number;
	logger?: SyncLogger | undefined;
}

export interface BaselineRateSyncWorkerOptions {
	exchangeRateService: ExchangeRateService;
	exchangeRateConfigService: ExchangeRateConfigService;
	wallexClient?: WallexClient | undefined;
	botTelegramId?: bigint | number | undefined;
	logger?: SyncLogger | undefined;
}

export interface StartSyncOptions {
	runImmediately?: boolean | undefined;
}

/**
 * Standalone callable sync function for unit testing and execution without timers.
 * Fetches an OTC price quote from Wallex ('USDTTMN', 'BUY') and calls ExchangeRateService.setRate()
 * using the bot's own Telegram ID as created_by_admin_telegram_id.
 *
 * On Wallex failure, logs the error and returns null without crashing or overwriting existing rows.
 */
export async function syncBaselineRate(deps: SyncBaselineRateDependencies): Promise<ExchangeRate | null> {
	const logger = deps.logger ?? console;
	try {
		const quote = await deps.wallexClient.getOtcPrice("USDTTMN", "BUY");
		const rate = await deps.exchangeRateService.setRate(deps.botTelegramId, quote.priceIrr);
		logger.info?.(`Baseline rate synced successfully from Wallex: ${rate.irrPerUsd} IRR`);
		return rate;
	} catch (error) {
		logger.error("Failed to sync baseline rate from Wallex:", error);
		return null;
	}
}

/**
 * In-process background worker managing the periodic baseline rate sync timer.
 * Timer runs when Auto-Sync mode is active, with interval sourced from exchange_rate_config table.
 */
@injectable()
export class BaselineRateSyncWorker {
	private timer: NodeJS.Timeout | null = null;
	private isSyncing = false;
	private currentIntervalMinutes: number | null = null;
	private readonly exchangeRateService: ExchangeRateService;
	private readonly exchangeRateConfigService: ExchangeRateConfigService;
	private readonly wallexClient?: WallexClient | undefined;
	private botTelegramId?: bigint | undefined;
	private readonly logger?: SyncLogger | undefined;

	constructor(
		@inject(TOKENS.ExchangeRateService)
		optionsOrService: BaselineRateSyncWorkerOptions | ExchangeRateService,
		@inject(TOKENS.ExchangeRateConfigService)
		exchangeRateConfigService?: ExchangeRateConfigService,
		@inject(TOKENS.WallexClient)
		wallexClient?: WallexClient,
		botTelegramId?: bigint | number,
	) {
		if ("exchangeRateService" in optionsOrService) {
			this.exchangeRateService = optionsOrService.exchangeRateService;
			this.exchangeRateConfigService = optionsOrService.exchangeRateConfigService;
			this.wallexClient = optionsOrService.wallexClient;
			if (optionsOrService.botTelegramId !== undefined) {
				this.botTelegramId = normalizeChatId(optionsOrService.botTelegramId);
			}
			this.logger = optionsOrService.logger;
		} else {
			this.exchangeRateService = optionsOrService;
			this.exchangeRateConfigService = exchangeRateConfigService!;
			this.wallexClient = wallexClient;
			if (botTelegramId !== undefined) {
				this.botTelegramId = normalizeChatId(botTelegramId);
			}
		}

		if (!this.botTelegramId && process.env.BOT_TOKEN) {
			const parsed = parseBotIdFromToken(process.env.BOT_TOKEN);
			if (parsed) {
				this.botTelegramId = parsed;
			}
		}
	}

	public setBotTelegramId(id: bigint | number): void {
		this.botTelegramId = normalizeChatId(id);
	}

	public getBotTelegramId(): bigint | undefined {
		return this.botTelegramId;
	}

	public isRunning(): boolean {
		return this.timer !== null;
	}

	public getIntervalMinutes(): number | null {
		return this.currentIntervalMinutes;
	}

	// Executes a single baseline rate sync.
	// Exported and accessible without timers.
	public async sync(): Promise<ExchangeRate | null> {
		if (this.isSyncing) {
			this.logger?.warn?.("Baseline rate sync is already in progress, skipping concurrent run.");
			return null;
		}

		if (!this.wallexClient) {
			const logger = this.logger ?? console;
			logger.warn?.("WallexClient is not configured, skipping baseline rate sync.");
			return null;
		}

		const botId = this.botTelegramId ?? parseBotIdFromToken(process.env.BOT_TOKEN);
		if (!botId) {
			const logger = this.logger ?? console;
			logger.error("Bot Telegram ID is unknown, cannot attribute baseline rate insertion.");
			return null;
		}

		this.isSyncing = true;
		try {
			return await syncBaselineRate({
				wallexClient: this.wallexClient,
				exchangeRateService: this.exchangeRateService,
				botTelegramId: botId,
				logger: this.logger,
			});
		} finally {
			this.isSyncing = false;
		}
	}

	// Starts the periodic background sync timer.
	// Interval is sourced from the exchange_rate_config table if not explicitly provided.
	public async start(intervalMinutes?: number, options?: StartSyncOptions): Promise<void> {
		this.stop();

		let interval = intervalMinutes;
		if (!interval || interval <= 0) {
			try {
				const config = await this.exchangeRateConfigService.getConfig();
				interval = config.syncIntervalMinutes;
			} catch (err) {
				const logger = this.logger ?? console;
				logger.error("Failed to read sync interval from config table, falling back to 60 minutes:", err);
				interval = 60;
			}
		}

		if (!interval || interval <= 0) {
			interval = 60;
		}

		this.currentIntervalMinutes = interval;

		if (options?.runImmediately) {
			try {
				await this.sync();
			} catch (err) {
				const logger = this.logger ?? console;
				logger.error("Unexpected error during immediate baseline rate sync on start:", err);
			}
		}

		const intervalMs = interval * 60 * 1000;
		this.timer = setInterval(async () => {
			try {
				await this.sync();
			} catch (err) {
				const logger = this.logger ?? console;
				logger.error("Unexpected error during background baseline rate sync:", err);
			}
		}, intervalMs);

		this.timer.unref?.();
		this.logger?.info?.(`Baseline rate sync worker started with interval of ${interval} minutes.`);
	}

	//
	// Stops the periodic background sync timer.
	public stop(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
			this.currentIntervalMinutes = null;
			this.logger?.info?.("Baseline rate sync worker stopped.");
		}
	}
}
