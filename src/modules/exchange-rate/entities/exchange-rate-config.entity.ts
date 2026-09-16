export type RateMode = "MANUAL" | "AUTO_SYNC";

export interface ExchangeRateConfigProps {
	id: string;
	mode: RateMode;
	spreadPercent: string | number;
	syncIntervalMinutes: number;
	updatedByAdminTelegramId?: bigint | null;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * ExchangeRateConfig Domain Entity.
 * Singleton entity managing the system-wide exchange rate pricing mode, spread percentage,
 * and background baseline rate sync interval.
 */
export class ExchangeRateConfig {
	public readonly id: string;
	public readonly mode: RateMode;
	public readonly spreadPercent: string;
	public readonly syncIntervalMinutes: number;
	public readonly updatedByAdminTelegramId: bigint | null;
	public readonly createdAt: Date;
	public readonly updatedAt: Date;

	constructor(props: ExchangeRateConfigProps) {
		this.id = props.id;
		this.mode = props.mode;
		this.spreadPercent = typeof props.spreadPercent === "number" ? props.spreadPercent.toFixed(2) : props.spreadPercent;
		this.syncIntervalMinutes = props.syncIntervalMinutes;
		this.updatedByAdminTelegramId = props.updatedByAdminTelegramId ?? null;
		this.createdAt = props.createdAt;
		this.updatedAt = props.updatedAt;
	}

	public isAutoSync(): boolean {
		return this.mode === "AUTO_SYNC";
	}

	public isManual(): boolean {
		return this.mode === "MANUAL";
	}
}
