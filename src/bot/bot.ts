import 'reflect-metadata';
import type { BotContext } from '@/bot/context';
import { registerConversations } from '@/bot/conversations';
import { createAdminComposer } from '@/bot/handlers/admin/admin.composer';
import { TelegramOrderNotifier } from '@/bot/handlers/admin/order.notifier';
import { TelegramOtcPurchaseNotifier } from '@/bot/handlers/admin/otc-purchase.notifier';
import { createBuyerComposer } from '@/bot/handlers/buyer/buyer.composer';
import type { DbClient } from '@/core/database/client';
import { createAppContainer } from '@/core/di/container';
import { TOKENS } from '@/core/di/tokens';
import type { IOrderRepository } from '@/modules/order/order.repository.interface';
import { TopUpLimits } from '@/modules/top-up/top-up.limits.vo';
import { conversations } from '@grammyjs/conversations';
import { Bot, type BotConfig } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import type { DependencyContainer } from 'tsyringe';

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

  // 1. Plugins & Conversations
  bot.use(conversations());
  registerConversations(bot, appContainer, limits);

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
