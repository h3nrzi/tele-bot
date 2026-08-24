import { Bot, type Context } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import type { DbClient } from '../db/client';
import { handleStart } from './handlers/start';
import { handleBalance } from './handlers/balance';

export interface CreateBotOptions {
  token?: string;
  dbClient?: DbClient;
  botInfo?: UserFromGetMe;
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

  return bot;
}
