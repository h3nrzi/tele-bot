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
import { OrderService } from '@/modules/order/order.service';
import { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import { ExchangeRateConfigService } from '@/modules/exchange-rate/exchange-rate-config.service';
import { OtcPurchaseService } from '@/modules/otc-purchase/otc-purchase.service';
import { TelegramOtcPurchaseNotifier } from '@/bot/handlers/admin/otc-purchase.notifier';
import { TelegramOrderNotifier } from '@/bot/handlers/admin/order.notifier';
import type { IOrderRepository } from '@/modules/order/order.repository.interface';
import { TOKENS } from '@/core/di/tokens';

import {
  createSetCardConversation,
  SETCARD_CONVERSATION_ID,
} from '@/bot/handlers/admin/set-card.conversation';
import {
  createSetRateConversation,
  SETRATE_CONVERSATION_ID,
} from '@/bot/handlers/admin/set-rate.conversation';
import {
  createSpreadConversation,
  SPREAD_CONVERSATION_ID,
} from '@/bot/handlers/admin/spread.conversation';
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
import {
  createFulfilOrderConversation,
  FULFIL_ORDER_CONVERSATION_ID,
} from '@/bot/handlers/admin/fulfil.conversation';
import {
  createRejectOrderConversation,
  REJECT_ORDER_CONVERSATION_ID,
} from '@/bot/handlers/admin/order-reject.conversation';
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

  const botConfig: BotConfig<BotContext> = {};
  if (options?.botInfo) {
    botConfig.botInfo = options.botInfo;
  }
  if (options?.client) {
    botConfig.client = options.client;
  }

  const bot = new Bot<BotContext>(token, botConfig);

  const orderNotifier = new TelegramOrderNotifier({
    api: bot.api,
    adminIds: options?.adminIds ?? process.env.ADMIN_IDS,
    orderRepo: appContainer.resolve<IOrderRepository>(TOKENS.OrderRepository),
  });
  appContainer.register(TOKENS.OrderNotifier, { useValue: orderNotifier });

  const otcNotifier = new TelegramOtcPurchaseNotifier({
    api: bot.api,
    opsGroupId: process.env.TELEGRAM_OPS_GROUP_ID,
    adminIds: options?.adminIds ?? process.env.ADMIN_IDS,
  });
  appContainer.register(TOKENS.OtcPurchaseNotifier, { useValue: otcNotifier });
  if (
    appContainer.isRegistered(TOKENS.OtcPurchaseService) ||
    appContainer.isRegistered(OtcPurchaseService)
  ) {
    try {
      const otcService = appContainer.resolve(OtcPurchaseService);
      otcService.setNotifier(otcNotifier);
    } catch {}
  }

  const bankAccountService = appContainer.resolve(BankAccountService);
  const topUpService = appContainer.resolve(TopUpService);
  const buyerService = appContainer.resolve(BuyerService);
  const catalogService = appContainer.resolve(CatalogService);
  const orderService = appContainer.resolve(OrderService);
  const exchangeRateService = appContainer.resolve(ExchangeRateService);
  const exchangeRateConfigService = appContainer.resolve(ExchangeRateConfigService);


  // 1. Plugins & Conversations
  bot.use(conversations());
  bot.use(
    createConversation<BotContext, Context>(
      createSetRateConversation(exchangeRateService, exchangeRateConfigService),
      {
        id: SETRATE_CONVERSATION_ID,
      }
    )
  );
  bot.use(
    createConversation<BotContext, Context>(
      createSpreadConversation(exchangeRateConfigService),
      {
        id: SPREAD_CONVERSATION_ID,
      }
    )
  );
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
  bot.use(
    createConversation<BotContext, Context>(
      createFulfilOrderConversation(orderService),
      {
        id: FULFIL_ORDER_CONVERSATION_ID,
      }
    )
  );
  bot.use(
    createConversation<BotContext, Context>(
      createRejectOrderConversation(orderService),
      {
        id: REJECT_ORDER_CONVERSATION_ID,
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
