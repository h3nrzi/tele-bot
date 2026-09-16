import "reflect-metadata";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Bot } from "grammy";
import type { DependencyContainer } from "tsyringe";
import type { BotContext } from "@/bot/context";
import { registerConversations } from "@/bot/conversations";
import { TopUpLimits } from "@/modules/top-up/top-up.limits.vo";
import { BankAccountService } from "@/modules/bank-account/bank-account.service";
import { TopUpService } from "@/modules/top-up/top-up.service";
import { BuyerService } from "@/modules/buyer/buyer.service";
import { CatalogService } from "@/modules/catalog/catalog.service";
import { OrderService } from "@/modules/order/order.service";
import { ExchangeRateService } from "@/modules/exchange-rate/services/exchange-rate.service";
import { ExchangeRateConfigService } from "@/modules/exchange-rate/services/exchange-rate-config.service";

import { SETRATE_CONVERSATION_ID } from "@/bot/handlers/admin/set-rate.conversation";
import { SPREAD_CONVERSATION_ID } from "@/bot/handlers/admin/spread.conversation";
import { SETCARD_CONVERSATION_ID } from "@/bot/handlers/admin/set-card.conversation";
import { TOPUP_CONVERSATION_ID } from "@/bot/handlers/buyer/top-up.conversation";
import { REJECT_CONVERSATION_ID } from "@/bot/handlers/admin/reject.conversation";
import {
	ADD_CATALOG_ITEM_CONVERSATION_ID,
	EDIT_CATALOG_ITEM_CONVERSATION_ID,
} from "@/bot/handlers/admin/catalog.conversation";
import { FULFIL_ORDER_CONVERSATION_ID } from "@/bot/handlers/admin/fulfil.conversation";
import { REJECT_ORDER_CONVERSATION_ID } from "@/bot/handlers/admin/order-reject.conversation";

vi.mock("@grammyjs/conversations", () => ({
	createConversation: vi.fn((_builder: unknown, options: { id: string } | string) => {
		const id = typeof options === "string" ? options : options?.id;
		return Object.assign(vi.fn(), { id });
	}),
}));

describe("registerConversations", () => {
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

	let useSpy: ReturnType<typeof vi.fn>;
	let mockBot: Bot<BotContext>;
	let mockContainer: DependencyContainer;
	let mockLimits: TopUpLimits;

	beforeEach(() => {
		vi.clearAllMocks();

		useSpy = vi.fn();
		mockBot = {
			use: useSpy,
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

		mockLimits = new TopUpLimits("10.00", "1000.00", 30);
	});

	it("calls bot.use exactly nine times with handlers bearing expected conversation IDs", () => {
		registerConversations(mockBot, mockContainer, mockLimits);

		// 1. Assert bot.use was called exactly nine times
		expect(useSpy).toHaveBeenCalledTimes(9);

		// 2. Assert each call received a handler whose conversation ID matches one of the nine expected IDs
		const registeredIds = useSpy.mock.calls.map(([handler]) => handler.id);
		expect(registeredIds).toEqual(expectedConversationIds);

		// 3. Assert minimal mock container stubbed service resolutions used by each factory
		expect(mockContainer.resolve).toHaveBeenCalledWith(ExchangeRateService);
		expect(mockContainer.resolve).toHaveBeenCalledWith(ExchangeRateConfigService);
		expect(mockContainer.resolve).toHaveBeenCalledWith(BankAccountService);
		expect(mockContainer.resolve).toHaveBeenCalledWith(TopUpService);
		expect(mockContainer.resolve).toHaveBeenCalledWith(BuyerService);
		expect(mockContainer.resolve).toHaveBeenCalledWith(CatalogService);
		expect(mockContainer.resolve).toHaveBeenCalledWith(OrderService);
	});
});
