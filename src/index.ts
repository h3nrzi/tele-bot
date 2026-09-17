import "reflect-metadata";
import "dotenv/config";
import { createAppContainer } from "@/core/di/container";
import { createDatabaseConnection } from "@/core/database/client";
import { createBot, setupBotCommands } from "@/bot";
import { TOKENS } from "@/core/di/tokens";
import { ExchangeRateConfigService } from "@/modules/exchange-rate/services/exchange-rate-config.service";
import { BaselineRateSyncWorker } from "@/modules/exchange-rate/baseline-rate-sync.worker";
import { parseBotIdFromToken } from "@/core/shared/telegram.utils";

async function main(): Promise<void> {
	const token = process.env.BOT_TOKEN;
	if (!token) {
		console.error("BOT_TOKEN environment variable is required to start the bot.");
		process.exit(1);
	}

	const dbConnection = createDatabaseConnection();
	const container = createAppContainer({ databaseConnection: dbConnection });
	const bot = createBot({ token, container });

	const syncWorker = container.isRegistered(TOKENS.BaselineRateSyncWorker)
		? container.resolve<BaselineRateSyncWorker>(TOKENS.BaselineRateSyncWorker)
		: container.resolve(BaselineRateSyncWorker);

	const initialBotId = parseBotIdFromToken(token);
	if (initialBotId) {
		syncWorker.setBotTelegramId(initialBotId);
	}

	const shutdown = async () => {
		console.log("Stopping bot, sync worker, and closing database pool...");
		syncWorker.stop();
		await bot.stop();
		await dbConnection.pool.end();
		process.exit(0);
	};

	process.once("SIGINT", shutdown);
	process.once("SIGTERM", shutdown);

	// Check rate mode and conditionally start baseline sync worker on boot
	try {
		const configService = container.resolve(ExchangeRateConfigService);
		const config = await configService.getConfig();
		if (config.isAutoSync()) {
			console.log(
				`Auto-Sync mode is active on boot. Starting baseline rate sync worker (interval: ${config.syncIntervalMinutes}m)...`,
			);
			await syncWorker.start(config.syncIntervalMinutes, {
				runImmediately: true,
			});
		}
	} catch (err) {
		console.error("Failed to initialize baseline rate sync worker on startup:", err);
	}

	console.log("Setting up Telegram command menus and chat menu button...");
	await setupBotCommands(bot.api, process.env.ADMIN_IDS);

	console.log("Starting Voltix with long polling...");
	await bot.start({
		onStart: (botInfo) => {
			syncWorker.setBotTelegramId(BigInt(botInfo.id));
			console.log(`Voltix is running as @${botInfo.username} (ID: ${botInfo.id})`);
		},
	});
}

main().catch((err) => {
	console.error("Fatal error starting bot:", err);
	process.exit(1);
});
