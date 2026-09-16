import { describe, it, expect } from "vitest";
import { ExchangeRateConfig, type RateMode } from "@/modules/exchange-rate/exchange-rate-config.entity";

describe("Domain Entity: ExchangeRateConfig", () => {
	const now = new Date();

	it("initializes with default values and supports isManual / isAutoSync", () => {
		const config = new ExchangeRateConfig({
			id: "cfg-1",
			mode: "MANUAL",
			spreadPercent: "0.00",
			syncIntervalMinutes: 60,
			updatedByAdminTelegramId: null,
			createdAt: now,
			updatedAt: now,
		});

		expect(config.id).toBe("cfg-1");
		expect(config.mode).toBe("MANUAL");
		expect(config.isManual()).toBe(true);
		expect(config.isAutoSync()).toBe(false);
		expect(config.spreadPercent).toBe("0.00");
		expect(config.syncIntervalMinutes).toBe(60);
		expect(config.updatedByAdminTelegramId).toBeNull();
	});

	it("formats numeric spreadPercent properly", () => {
		const config = new ExchangeRateConfig({
			id: "cfg-2",
			mode: "AUTO_SYNC",
			spreadPercent: 2.5,
			syncIntervalMinutes: 30,
			updatedByAdminTelegramId: 999888777n,
			createdAt: now,
			updatedAt: now,
		});

		expect(config.mode).toBe("AUTO_SYNC");
		expect(config.isAutoSync()).toBe(true);
		expect(config.isManual()).toBe(false);
		expect(config.spreadPercent).toBe("2.50");
		expect(config.syncIntervalMinutes).toBe(30);
		expect(config.updatedByAdminTelegramId).toBe(999888777n);
	});
});
