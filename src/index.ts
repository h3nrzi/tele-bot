import 'dotenv/config';
import { createDatabaseConnection } from './db/client';
import { createBot } from './bot/bot';

async function main(): Promise<void> {
  const token = process.env.BOT_TOKEN;
  if (!token) {
    console.error('BOT_TOKEN environment variable is required to start the bot.');
    process.exit(1);
  }

  const { db, pool } = createDatabaseConnection();
  const bot = createBot({ token, dbClient: db });

  const shutdown = async () => {
    console.log('Stopping bot and closing database pool...');
    await bot.stop();
    await pool.end();
    process.exit(0);
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

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
