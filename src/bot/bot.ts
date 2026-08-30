import { Bot, type Context, type BotConfig } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import type { UserFromGetMe } from 'grammy/types';
import type { DependencyContainer } from 'tsyringe';
import type { DbClient } from '@/core/database/client';
import { TopUpLimits } from '@/modules/top-up/top-up.limits.vo';
import type { BotContext } from '@/bot/context';
import { createAppContainer } from '@/core/di/container';
import { BankAccountService } from '@/modules/bank-account/bank-account.service';
import { TopUpService } from '@/modules/top-up/top-up.service';
import { BuyerService } from '@/modules/buyer/buyer.service';
import { CatalogService } from '@/modules/catalog/catalog.service';
import {
  createSetCardConversation,
  SETCARD_CONVERSATION_ID,
} from '@/bot/handlers/admin/set-card.conversation';
import {
  createTopUpConversation,
  TOPUP_CONVERSATION_ID,
} from '@/bot/handlers/buyer/top-up.conversation';
import {
  createRejectConversation,
  REJECT_CONVERSATION_ID,
} from '@/bot/handlers/admin/reject.conversation';
import {
  createAddCatalogItemConversation,
  ADD_CATALOG_ITEM_CONVERSATION_ID,
  createEditCatalogItemConversation,
  EDIT_CATALOG_ITEM_CONVERSATION_ID,
} from '@/bot/handlers/admin/catalog.conversation';
import { createBuyerComposer } from '@/bot/handlers/buyer/buyer.composer';
import { createAdminComposer } from '@/bot/handlers/admin/admin.composer';

export interface CreateBotOptions {
  token?: string | undefined;
  container?: DependencyContainer | undefined;
  dbClient?: DbClient | undefined;
  botInfo?: UserFromGetMe | undefined;
  adminIds?: string | Set<bigint> | undefined;
  client?: BotConfig<BotContext>['client'] | undefined;
  topUpLimits?: TopUpLimits | undefined;
}

/**
 * Creates and configures a grammY Bot instance with domain-aligned composers, conversations, and DI-resolved dependencies.
 */
export function createBot(options?: CreateBotOptions): Bot<BotContext> {
  const token = options?.token ?? process.env.BOT_TOKEN;
  if (!token) {
    throw new Error('BOT_TOKEN is required to initialize the bot.');
  }

  // Resolve or create DI container
  const appContainer =
    options?.container ??
    createAppContainer({
      dbClient: options?.dbClient,
      topUpLimits: options?.topUpLimits,
      child: true,
    });

  let limits = options?.topUpLimits;
  if (!limits) {
    try {
      limits = TopUpLimits.fromEnv();
    } catch {
      // Fallback for tests if env is not set
    }
  }

  const bankAccountService = appContainer.resolve(BankAccountService);
  const topUpService = appContainer.resolve(TopUpService);
  const buyerService = appContainer.resolve(BuyerService);
  const catalogService = appContainer.resolve(CatalogService);

  const botConfig: BotConfig<BotContext> = {};
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
      createSetCardConversation(bankAccountService),
      {
        id: SETCARD_CONVERSATION_ID,
      }
    )
  );
  bot.use(
    createConversation<BotContext, Context>(
      createTopUpConversation(topUpService, buyerService, bankAccountService, limits),
      {
        id: TOPUP_CONVERSATION_ID,
      }
    )
  );
  bot.use(
    createConversation<BotContext, Context>(
      createRejectConversation(topUpService),
      {
        id: REJECT_CONVERSATION_ID,
      }
    )
  );
  bot.use(
    createConversation<BotContext, Context>(
      createAddCatalogItemConversation(catalogService),
      {
        id: ADD_CATALOG_ITEM_CONVERSATION_ID,
      }
    )
  );
  bot.use(
    createConversation<BotContext, Context>(
      createEditCatalogItemConversation(catalogService),
      {
        id: EDIT_CATALOG_ITEM_CONVERSATION_ID,
      }
    )
  );

  // 2. Domain Presentation Composers
  bot.use(
    createBuyerComposer({
      container: appContainer,
      adminIds: options?.adminIds,
    })
  );

  bot.use(
    createAdminComposer({
      container: appContainer,
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
