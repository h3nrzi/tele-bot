import { Bot, type Context } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import type { DbClient } from '../db/client';
import { handleStart } from './handlers/start';
import { handleBalance } from './handlers/balance';
import { handleSetRate } from './handlers/set-rate';
import { createAdminMiddleware } from './middleware/admin';

export interface CreateBotOptions {
  token?: string | undefined;
  dbClient?: DbClient | undefined;
  botInfo?: UserFromGetMe | undefined;
  adminIds?: string | Set<bigint> | undefined;
}

/**
 * Creates and configures a grammY Bot instance with all command handlers and middleware.
 */
export function createBot(options?: CreateBotOptions): Bot<Context> {
  const token = options?.token ?? process.env.BOT_TOKEN;
  if (!token) {
    throw new Error('BOT_TOKEN is required to initialize the bot.');
  }

  const bot = new Bot<Context>(
    token,
    options?.botInfo ? { botInfo: options.botInfo } : undefined
  );

  bot.command('start', async (ctx) => {
    await handleStart(ctx, options?.dbClient);
  });

  bot.command('balance', async (ctx) => {
    await handleBalance(ctx, options?.dbClient);
  });

  const adminAuth = createAdminMiddleware({ adminIds: options?.adminIds });

  bot.command('setrate', adminAuth, async (ctx) => {
    await handleSetRate(ctx, options?.dbClient);
  });

  return bot;
}

