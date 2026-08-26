import { Bot, type Context } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import type { UserFromGetMe } from 'grammy/types';
import type { DbClient } from '../db/client';
import { handleStart } from './handlers/start';
import { handleBalance } from './handlers/balance';
import { handleSetRate } from './handlers/set-rate';
import { handleRate } from './handlers/rate';
import {
  createSetCardConversation,
  SETCARD_CONVERSATION_ID,
  type BotContext,
} from './handlers/set-card';
import {
  createTopUpConversation,
  handleTopUpCommand,
  TOPUP_CONVERSATION_ID,
} from './handlers/topup';
import { handlePhotoMessage } from './handlers/receipt';
import { createAdminMiddleware } from './middleware/admin';
import { getTopUpLimits, type TopUpLimits } from '../utils/currency';

import type { ApiClientOptions } from 'grammy';

export interface CreateBotOptions {
  token?: string | undefined;
  dbClient?: DbClient | undefined;
  botInfo?: UserFromGetMe | undefined;
  adminIds?: string | Set<bigint> | undefined;
  client?: ApiClientOptions | undefined;
  topUpLimits?: TopUpLimits | undefined;
}

/**
 * Creates and configures a grammY Bot instance with all command handlers and middleware.
 */
export function createBot(options?: CreateBotOptions): Bot<BotContext> {
  const token = options?.token ?? process.env.BOT_TOKEN;
  if (!token) {
    throw new Error('BOT_TOKEN is required to initialize the bot.');
  }

  const limits = options?.topUpLimits ?? getTopUpLimits();

  const botConfig: NonNullable<ConstructorParameters<typeof Bot<BotContext>>[1]> = {};
  if (options?.botInfo) {
    botConfig.botInfo = options.botInfo;
  }
  if (options?.client) {
    botConfig.client = options.client;
  }

  const bot = new Bot<BotContext>(token, botConfig);

  bot.use(conversations());
  bot.use(
    createConversation<BotContext, Context>(createSetCardConversation(options?.dbClient), {
      id: SETCARD_CONVERSATION_ID,
    })
  );
  bot.use(
    createConversation<BotContext, Context>(
      createTopUpConversation(options?.dbClient, limits),
      {
        id: TOPUP_CONVERSATION_ID,
      }
    )
  );

  bot.command('start', async (ctx) => {
    await handleStart(ctx, options?.dbClient);
  });

  bot.command('balance', async (ctx) => {
    await handleBalance(ctx, options?.dbClient);
  });

  bot.command('topup', async (ctx) => {
    await handleTopUpCommand(ctx, options?.dbClient, { adminIds: options?.adminIds });
  });

  const adminAuth = createAdminMiddleware<BotContext>({ adminIds: options?.adminIds });

  bot.command('setrate', adminAuth, async (ctx) => {
    await handleSetRate(ctx, options?.dbClient);
  });

  bot.command('rate', adminAuth, async (ctx) => {
    await handleRate(ctx, options?.dbClient);
  });

  bot.command('setcard', adminAuth, async (ctx) => {
    await ctx.conversation.enter(SETCARD_CONVERSATION_ID);
  });

  bot.on('message:photo', async (ctx) => {
    await handlePhotoMessage(ctx, options?.dbClient, {
      adminIds: options?.adminIds,
    });
  });

  bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`Error while handling update ${ctx.update.update_id}:`, err.error);
  });

  return bot;
}


