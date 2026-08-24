import { Bot, type Context } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import type { DbClient } from '../db/client';
import { handleStart } from './handlers/start';

export interface CreateBotOptions {
  token?: string;
  dbClient?: DbClient;
  botInfo?: UserFromGetMe;
}

/**
 * Creates and configures a grammY Bot instance with all command handlers and middleware.
 */
export function createBot(options?: CreateBotOptions): Bot<Context> {
  const token = options?.token ?? process.env.BOT_TOKEN ?? 'dummy_token';
  const bot = new Bot<Context>(
    token,
    options?.botInfo ? { botInfo: options.botInfo } : undefined
  );

  bot.command('start', async (ctx) => {
    await handleStart(ctx, options?.dbClient);
  });

  return bot;
}
