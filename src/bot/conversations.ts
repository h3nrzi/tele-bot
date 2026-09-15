import type { Bot, Context } from 'grammy';
import { createConversation, type ConversationBuilder } from '@grammyjs/conversations';
import type { DependencyContainer } from 'tsyringe';
import type { BotContext } from '@/bot/context';
import type { TopUpLimits } from '@/modules/top-up/top-up.limits.vo';
import { BankAccountService } from '@/modules/bank-account/bank-account.service';
import { TopUpService } from '@/modules/top-up/top-up.service';
import { BuyerService } from '@/modules/buyer/buyer.service';
import { CatalogService } from '@/modules/catalog/catalog.service';
import { OrderService } from '@/modules/order/order.service';
import { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import { ExchangeRateConfigService } from '@/modules/exchange-rate/exchange-rate-config.service';

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

interface ConversationDescriptor {
  id: string;
  factory: (
    container: DependencyContainer,
    limits?: TopUpLimits
  ) => ConversationBuilder<BotContext, Context>;
}

const conversationDescriptors: readonly ConversationDescriptor[] = [
  {
    id: SETRATE_CONVERSATION_ID,
    factory: (container) =>
      createSetRateConversation(
        container.resolve(ExchangeRateService),
        container.resolve(ExchangeRateConfigService)
      ),
  },
  {
    id: SPREAD_CONVERSATION_ID,
    factory: (container) =>
      createSpreadConversation(container.resolve(ExchangeRateConfigService)),
  },
  {
    id: SETCARD_CONVERSATION_ID,
    factory: (container) =>
      createSetCardConversation(container.resolve(BankAccountService)),
  },
  {
    id: TOPUP_CONVERSATION_ID,
    factory: (container, limits) =>
      createTopUpConversation(
        container.resolve(TopUpService),
        container.resolve(BuyerService),
        container.resolve(BankAccountService),
        limits
      ),
  },
  {
    id: REJECT_CONVERSATION_ID,
    factory: (container) =>
      createRejectConversation(container.resolve(TopUpService)),
  },
  {
    id: ADD_CATALOG_ITEM_CONVERSATION_ID,
    factory: (container) =>
      createAddCatalogItemConversation(container.resolve(CatalogService)),
  },
  {
    id: EDIT_CATALOG_ITEM_CONVERSATION_ID,
    factory: (container) =>
      createEditCatalogItemConversation(container.resolve(CatalogService)),
  },
  {
    id: FULFIL_ORDER_CONVERSATION_ID,
    factory: (container) =>
      createFulfilOrderConversation(container.resolve(OrderService)),
  },
  {
    id: REJECT_ORDER_CONVERSATION_ID,
    factory: (container) =>
      createRejectOrderConversation(container.resolve(OrderService)),
  },
];

/**
 * Registers all conversations with the bot using their respective descriptors.
 */
export function registerConversations(
  bot: Bot<BotContext>,
  container: DependencyContainer,
  limits?: TopUpLimits
): void {
  for (const descriptor of conversationDescriptors) {
    bot.use(
      createConversation<BotContext, Context>(
        descriptor.factory(container, limits),
        {
          id: descriptor.id,
        }
      )
    );
  }
}
