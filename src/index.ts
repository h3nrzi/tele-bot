import 'reflect-metadata';
import 'dotenv/config';
import { createAppContainer } from '@/core/di/container';
import { createDatabaseConnection } from '@/core/database/client';
import { createBot, setupBotCommands } from '@/bot';

async function main(): Promise<void> {
  const token = process.env.BOT_TOKEN;
  if (!token) {
    console.error('BOT_TOKEN environment variable is required to start the bot.');
    process.exit(1);
  }

  const dbConnection = createDatabaseConnection();
  const container = createAppContainer({ databaseConnection: dbConnection });
  const bot = createBot({ token, container });

  const shutdown = async () => {
    console.log('Stopping bot and closing database pool...');
    await bot.stop();
    await dbConnection.pool.end();
    process.exit(0);
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  console.log('Setting up Telegram command menus and chat menu button...');
  await setupBotCommands(bot.api, process.env.ADMIN_IDS);

  console.log('Starting Tele-Bot with long polling...');
  await bot.start({
    onStart: (botInfo) => {
      console.log(`Tele-Bot is running as @${botInfo.username} (ID: ${botInfo.id})`);
    },
  });
}

main().catch((err) => {
  console.error('Fatal error starting bot:', err);
  process.exit(1);
});
