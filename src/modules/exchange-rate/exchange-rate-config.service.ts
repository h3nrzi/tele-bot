import { injectable, inject } from "tsyringe";
import Decimal from "decimal.js";
import type { DbClient } from "@/core/database/client";
import { getDefaultDb } from "@/core/database/client";
import type { DbExecutor } from "@/core/database/types";
import type { IExchangeRateConfigRepository } from "./exchange-rate-config.repository.interface";
import { ExchangeRateConfig, type RateMode } from "./exchange-rate-config.entity";
import { InvalidSpreadError, InvalidSyncIntervalError, InvalidRateModeError } from "./exchange-rate.errors";
import { normalizeChatId } from "@/core/shared/telegram.utils";
import { TOKENS } from "@/core/di/tokens";

export interface UpdateConfigInput {
	mode?: RateMode | undefined;
	spreadPercent?: number | string | undefined;
	syncIntervalMinutes?: number | undefined;
	adminTelegramId?: bigint | number | undefined;
}

@injectable()
export class ExchangeRateConfigService {
	constructor(
		@inject(TOKENS.DbClient) private readonly db?: DbClient,
		@inject(TOKENS.ExchangeRateConfigRepository)
		private readonly configRepo?: IExchangeRateConfigRepository<DbExecutor>,
	) {}

	private getDb(executor?: DbExecutor): DbExecutor {
		return executor ?? this.db ?? getDefaultDb();
	}

	private getRepo(): IExchangeRateConfigRepository<DbExecutor> {
		if (!this.configRepo) {
			throw new Error("ExchangeRateConfigRepository was not provided");
		}
		return this.configRepo;
	}

	/**
	 * Retrieves the current ExchangeRateConfig singleton.
	 * If no config exists, creates and returns the default config (upsert semantics).
	 */
	public async getConfig(executor?: DbExecutor): Promise<ExchangeRateConfig> {
		const client = this.getDb(executor);
		const repo = this.getRepo();

		const existing = await repo.find(client);
		if (existing) {
			return existing;
		}

		return await repo.upsert(
			{
				mode: "MANUAL",
				spreadPercent: "0.00",
				syncIntervalMinutes: 60,
			},
			client,
		);
	}

	/**
	 * Updates the Rate Mode (MANUAL | AUTO_SYNC).
	 */
	public async updateMode(
		mode: RateMode,
		adminTelegramId?: bigint | number,
		executor?: DbExecutor,
	): Promise<ExchangeRateConfig> {
		if (mode !== "MANUAL" && mode !== "AUTO_SYNC") {
			throw new InvalidRateModeError();
		}

		return await this.updateConfig({ mode, adminTelegramId }, executor);
	}

	/**
	 * Updates the Spread percentage (0 - 10%).
	 */
	public async updateSpread(
		spreadPercent: number | string,
		adminTelegramId?: bigint | number,
		executor?: DbExecutor,
	): Promise<ExchangeRateConfig> {
		const validatedSpread = this.validateAndFormatSpread(spreadPercent);

		return await this.updateConfig({ spreadPercent: validatedSpread, adminTelegramId }, executor);
	}

	/**
	 * Updates the background sync interval in minutes (> 0 integer).
	 */
	public async updateSyncInterval(
		minutes: number,
		adminTelegramId?: bigint | number,
		executor?: DbExecutor,
	): Promise<ExchangeRateConfig> {
		if (typeof minutes !== "number" || isNaN(minutes) || !Number.isInteger(minutes) || minutes <= 0) {
			throw new InvalidSyncIntervalError();
		}

		return await this.updateConfig({ syncIntervalMinutes: minutes, adminTelegramId }, executor);
	}

	/**
	 * Updates multiple configuration properties atomically.
	 */
	public async updateConfig(input: UpdateConfigInput, executor?: DbExecutor): Promise<ExchangeRateConfig> {
		const client = this.getDb(executor);
		const repo = this.getRepo();

		const payload: Parameters<typeof repo.upsert>[0] = {};

		if (input.mode !== undefined) {
			if (input.mode !== "MANUAL" && input.mode !== "AUTO_SYNC") {
				throw new InvalidRateModeError();
			}
			payload.mode = input.mode;
		}

		if (input.spreadPercent !== undefined) {
			payload.spreadPercent = this.validateAndFormatSpread(input.spreadPercent);
		}

		if (input.syncIntervalMinutes !== undefined) {
			if (
				typeof input.syncIntervalMinutes !== "number" ||
				isNaN(input.syncIntervalMinutes) ||
				!Number.isInteger(input.syncIntervalMinutes) ||
				input.syncIntervalMinutes <= 0
			) {
				throw new InvalidSyncIntervalError();
			}
			payload.syncIntervalMinutes = input.syncIntervalMinutes;
		}

		if (input.adminTelegramId !== undefined && input.adminTelegramId !== null) {
			payload.updatedByAdminTelegramId = normalizeChatId(input.adminTelegramId);
		}

		return await repo.upsert(payload, client);
	}

	private validateAndFormatSpread(spread: number | string): string {
		let dec: Decimal;
		try {
			dec = new Decimal(spread);
		} catch {
			throw new InvalidSpreadError();
		}

		if (dec.isNaN() || dec.lt(0) || dec.gt(10)) {
			throw new InvalidSpreadError();
		}

		return dec.toFixed(2);
	}
}
