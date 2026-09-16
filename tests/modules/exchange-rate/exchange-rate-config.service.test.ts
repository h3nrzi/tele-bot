import { describe, it, expect, beforeEach } from "vitest";
import { setupTestDatabase } from "@tests/helpers/test-db";
import { ExchangeRateConfigService } from "@/modules/exchange-rate/exchange-rate-config.service";
import {
	InvalidSpreadError,
	InvalidSyncIntervalError,
	InvalidRateModeError,
} from "@/modules/exchange-rate/exchange-rate.errors";
import { exchangeRateConfig } from "@/modules/exchange-rate/exchange-rate-config.schema";
import { count } from "drizzle-orm";

describe("Exchange Rate Config Application Service", () => {
	const { db, container } = setupTestDatabase();
	let service: ExchangeRateConfigService;
	const adminId = 123456789n;

	beforeEach(() => {
		service = container.resolve(ExchangeRateConfigService);
	});

	it("returns default config with upsert semantics when table is empty", async () => {
		const config = await service.getConfig();

		expect(config).toBeDefined();
		expect(config.id).toBeDefined();
		expect(config.mode).toBe("MANUAL");
		expect(config.spreadPercent).toBe("0.00");
		expect(config.syncIntervalMinutes).toBe(60);
		expect(config.isManual()).toBe(true);
		expect(config.isAutoSync()).toBe(false);

		// Verify exactly one row in DB
		const [countResult] = await db.select({ value: count() }).from(exchangeRateConfig);
		expect(Number(countResult?.value ?? 0)).toBe(1);
	});

	it("updates mode to AUTO_SYNC and persists updatedByAdminTelegramId", async () => {
		const updated = await service.updateMode("AUTO_SYNC", adminId);

		expect(updated.mode).toBe("AUTO_SYNC");
		expect(updated.isAutoSync()).toBe(true);
		expect(updated.updatedByAdminTelegramId).toBe(adminId);

		const fetched = await service.getConfig();
		expect(fetched.mode).toBe("AUTO_SYNC");
		expect(fetched.updatedByAdminTelegramId).toBe(adminId);

		// Singleton check: still only 1 row
		const [countResult] = await db.select({ value: count() }).from(exchangeRateConfig);
		expect(Number(countResult?.value ?? 0)).toBe(1);
	});

	it("updates mode back to MANUAL", async () => {
		await service.updateMode("AUTO_SYNC", adminId);
		const updated = await service.updateMode("MANUAL", adminId);

		expect(updated.mode).toBe("MANUAL");
		expect(updated.isManual()).toBe(true);
	});

	it("rejects invalid rate mode", async () => {
		await expect(
			// @ts-expect-error testing invalid mode
			service.updateMode("INVALID_MODE", adminId),
		).rejects.toThrow(InvalidRateModeError);
	});

	it("updates spread percentage within 0 to 10 range and formats to 2 decimals", async () => {
		const updated = await service.updateSpread(1.5, adminId);
		expect(updated.spreadPercent).toBe("1.50");

		const updated2 = await service.updateSpread("2.75", adminId);
		expect(updated2.spreadPercent).toBe("2.75");

		const updatedZero = await service.updateSpread(0, adminId);
		expect(updatedZero.spreadPercent).toBe("0.00");

		const updatedMax = await service.updateSpread(10, adminId);
		expect(updatedMax.spreadPercent).toBe("10.00");
	});

	it("rejects spread percentage below 0 or above 10 or non-numeric", async () => {
		await expect(service.updateSpread(-0.1, adminId)).rejects.toThrow(InvalidSpreadError);
		await expect(service.updateSpread(10.01, adminId)).rejects.toThrow(InvalidSpreadError);
		await expect(service.updateSpread("invalid", adminId)).rejects.toThrow(InvalidSpreadError);
		await expect(service.updateSpread(NaN, adminId)).rejects.toThrow(InvalidSpreadError);
	});

	it("updates sync interval in minutes and validates positive integer", async () => {
		const updated = await service.updateSyncInterval(30, adminId);
		expect(updated.syncIntervalMinutes).toBe(30);

		await expect(service.updateSyncInterval(0, adminId)).rejects.toThrow(InvalidSyncIntervalError);
		await expect(service.updateSyncInterval(-10, adminId)).rejects.toThrow(InvalidSyncIntervalError);
		await expect(service.updateSyncInterval(15.5, adminId)).rejects.toThrow(InvalidSyncIntervalError);
	});

	it("updates multiple fields atomically with updateConfig", async () => {
		const updated = await service.updateConfig({
			mode: "AUTO_SYNC",
			spreadPercent: 2.25,
			syncIntervalMinutes: 45,
			adminTelegramId: adminId,
		});

		expect(updated.mode).toBe("AUTO_SYNC");
		expect(updated.spreadPercent).toBe("2.25");
		expect(updated.syncIntervalMinutes).toBe(45);
		expect(updated.updatedByAdminTelegramId).toBe(adminId);
	});
});
