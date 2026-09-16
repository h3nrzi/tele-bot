import type { BotContext } from '@/bot/context';
import { registerConversations } from '@/bot/conversations';
import {
    ADD_CATALOG_ITEM_CONVERSATION_ID,
    EDIT_CATALOG_ITEM_CONVERSATION_ID,
} from '@/bot/handlers/admin/catalog.conversation';
import { FULFIL_ORDER_CONVERSATION_ID } from '@/bot/handlers/admin/fulfil.conversation';
import { REJECT_ORDER_CONVERSATION_ID } from '@/bot/handlers/admin/order-reject.conversation';
import { REJECT_CONVERSATION_ID } from '@/bot/handlers/admin/reject.conversation';
import { SETCARD_CONVERSATION_ID } from '@/bot/handlers/admin/set-card.conversation';
import { SETRATE_CONVERSATION_ID } from '@/bot/handlers/admin/set-rate.conversation';
import { SPREAD_CONVERSATION_ID } from '@/bot/handlers/admin/spread.conversation';
import { TOPUP_CONVERSATION_ID } from '@/bot/handlers/buyer/top-up.conversation';

import { BankAccountService } from '@/modules/bank-account/bank-account.service';
import { BuyerService } from '@/modules/buyer/buyer.service';
import { CatalogService } from '@/modules/catalog/catalog.service';
import { ExchangeRateConfigService } from '@/modules/exchange-rate/exchange-rate-config.service';
import { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import { OrderService } from '@/modules/order/order.service';
import { TopUpLimits } from '@/modules/top-up/top-up.limits.vo';
import { TopUpService } from '@/modules/top-up/top-up.service';

import { createConversation } from '@grammyjs/conversations';
import type { Bot } from 'grammy';
import 'reflect-metadata';
import type { DependencyContainer } from 'tsyringe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@grammyjs/conversations', () => ({
  createConversation: vi.fn((builder: unknown, options: { id: string } | string) => {
    const id = typeof options === 'string' ? options : options?.id;
    const handler = Object.assign(vi.fn(), {
      id,
      conversationId: id,
      builder,
    });
    return handler;
  }),
}));

describe('registerConversations', () => {
  const expectedConversationIds = [
    SETRATE_CONVERSATION_ID,
    SPREAD_CONVERSATION_ID,
    SETCARD_CONVERSATION_ID,
    TOPUP_CONVERSATION_ID,
    REJECT_CONVERSATION_ID,
    ADD_CATALOG_ITEM_CONVERSATION_ID,
    EDIT_CATALOG_ITEM_CONVERSATION_ID,
    FULFIL_ORDER_CONVERSATION_ID,
    REJECT_ORDER_CONVERSATION_ID,
  ];

  let mockBot: Bot<BotContext>;
  let mockContainer: DependencyContainer;
  let mockLimits: TopUpLimits;

  beforeEach(() => {
    vi.clearAllMocks();

    mockBot = {
      use: vi.fn(),
    } as unknown as Bot<BotContext>;

    const mockServices = new Map<unknown, unknown>([
      [ExchangeRateService, {}],
      [ExchangeRateConfigService, {}],
      [BankAccountService, {}],
      [TopUpService, {}],
      [BuyerService, {}],
      [CatalogService, {}],
      [OrderService, {}],
    ]);

    mockContainer = {
      resolve: vi.fn((token: unknown) => mockServices.get(token) ?? {}),
    } as unknown as DependencyContainer;

    mockLimits = new TopUpLimits('10.00', '1000.00', 30);
  });

  it('constructs a mock bot, calls registerConversations, and asserts bot.use was called exactly nine times with expected conversation IDs', () => {
    registerConversations(mockBot, mockContainer, mockLimits);

    // 1. Assert bot.use was called exactly nine times
    expect(mockBot.use).toHaveBeenCalledTimes(9);

    // 2. Assert each call received a handler whose conversation ID matches one of the nine expected IDs
    const registeredHandlers = (mockBot.use as unknown as ReturnType<typeof vi.fn>).mock.calls.map(
      ([handler]) => handler
    );
    const registeredIds = registeredHandlers.map((handler: { id: string }) => handler.id);

    expect(registeredIds).toEqual(expectedConversationIds);
    expect(new Set(registeredIds).size).toBe(9);

    // 3. Assert createConversation was called with each expected ID and factory builder
    expect(createConversation).toHaveBeenCalledTimes(9);
    for (const id of expectedConversationIds) {
      expect(createConversation).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ id })
      );
    }

    // 4. Assert service resolutions used by the factories were invoked on the container
    expect(mockContainer.resolve).toHaveBeenCalledWith(ExchangeRateService);
    expect(mockContainer.resolve).toHaveBeenCalledWith(ExchangeRateConfigService);
    expect(mockContainer.resolve).toHaveBeenCalledWith(BankAccountService);
    expect(mockContainer.resolve).toHaveBeenCalledWith(TopUpService);
    expect(mockContainer.resolve).toHaveBeenCalledWith(BuyerService);
    expect(mockContainer.resolve).toHaveBeenCalledWith(CatalogService);
    expect(mockContainer.resolve).toHaveBeenCalledWith(OrderService);
  });

  it('registers all nine conversations when limits parameter is omitted', () => {
    registerConversations(mockBot, mockContainer);

    expect(mockBot.use).toHaveBeenCalledTimes(9);

    const registeredHandlers = (mockBot.use as unknown as ReturnType<typeof vi.fn>).mock.calls.map(
      ([handler]) => handler
    );
    const registeredIds = registeredHandlers.map((handler: { id: string }) => handler.id);

    expect(registeredIds).toEqual(expectedConversationIds);
  });
});
