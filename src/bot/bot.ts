import { Bot, type Context } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import type { UserFromGetMe } from 'grammy/types';
import type { ApiClientOptions } from 'grammy';
import type { DbClient } from '../db/client';
import { getTopUpLimits, type TopUpLimits } from '../utils/currency';
import type { BotContext } from './core/context';
import {
  createSetCardConversation,
  SETCARD_CONVERSATION_ID,
} from './modules/admin/bank-account/set-card.conversation';
import {
  createTopUpConversation,
  TOPUP_CONVERSATION_ID,
} from './modules/buyer/top-up/top-up.conversation';
import {
  createRejectConversation,
  REJECT_CONVERSATION_ID,
} from './modules/admin/top-up-rejection/reject.conversation';
import { createBuyerComposer } from './modules/buyer/buyer.composer';
import { createAdminComposer } from './modules/admin/admin.composer';

export interface CreateBotOptions {
  token?: string | undefined;
  dbClient?: DbClient | undefined;
  botInfo?: UserFromGetMe | undefined;
  adminIds?: string | Set<bigint> | undefined;
  client?: ApiClientOptions | undefined;
  topUpLimits?: TopUpLimits | undefined;
}

/**
 * Creates and configures a grammY Bot instance with domain-aligned composers, conversations, and plugins.
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

  // 1. Plugins & Conversations
  bot.use(conversations());
  bot.use(
    createConversation<BotContext, Context>(
      createSetCardConversation(options?.dbClient),
      {
        id: SETCARD_CONVERSATION_ID,
      }
    )
  );
  bot.use(
    createConversation<BotContext, Context>(
      createTopUpConversation(options?.dbClient, limits),
      {
        id: TOPUP_CONVERSATION_ID,
      }
    )
  );
  bot.use(
    createConversation<BotContext, Context>(
      createRejectConversation(options?.dbClient),
      {
        id: REJECT_CONVERSATION_ID,
      }
    )
  );

  // 2. Domain Presentation Composers
  bot.use(
    createBuyerComposer({
      dbClient: options?.dbClient,
      adminIds: options?.adminIds,
    })
  );

  bot.use(
    createAdminComposer({
      dbClient: options?.dbClient,
      adminIds: options?.adminIds,
    })
  );

  // 3. Error Boundary
  bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`Error while handling update ${ctx.update.update_id}:`, err.error);
  });

  return bot;
}
