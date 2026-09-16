import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setupTestDatabase } from "@tests/helpers/test-db";
import { createMockFetch } from "@tests/helpers/mock-context";
import { createBot } from "@/bot/bot";
import { ExchangeRateConfigService } from "@/modules/exchange-rate/services/exchange-rate-config.service";
import { cleanSpreadInput, isValidSpreadInput, calculateSpreadExample } from "@/bot/handlers/admin/conversations/spread.conversation";

describe("/spread Admin Command & Conversation", () => {
	const { db, container } = setupTestDatabase();
	const configService = container.resolve(ExchangeRateConfigService);
	const adminChatId = 123456789;
	const originalEnv = process.env.ADMIN_IDS;

	beforeEach(() => {
		process.env.ADMIN_IDS = `${adminChatId}`;
	});

	afterEach(() => {
		process.env.ADMIN_IDS = originalEnv;
	});

	function makeMessageUpdate(updateId: number, chatId: number, text: string, senderName = "Admin") {
		const isCommand = text.startsWith("/");
		const commandLength = text.indexOf(" ") > 0 ? text.indexOf(" ") : text.length;

		const message: Record<string, unknown> = {
			message_id: updateId,
			date: Math.floor(Date.now() / 1000),
			chat: { id: chatId, type: "private", first_name: senderName },
			from: { id: chatId, is_bot: false, first_name: senderName },
			text,
		};

		if (isCommand) {
			message.entities = [
				{
					offset: 0,
					length: commandLength,
					type: "bot_command",
				},
			];
		}

		return {
			update_id: updateId,
			message,
		} as any;
	}

	function makeCallbackQueryUpdate(updateId: number, chatId: number, data: string) {
		return {
			update_id: updateId,
			callback_query: {
				id: `cb_${updateId}`,
				from: { id: chatId, is_bot: false, first_name: "Admin" },
				chat_instance: "inst_1",
				data,
				message: {
					message_id: updateId,
					date: Math.floor(Date.now() / 1000),
					chat: { id: chatId, type: "private" },
					text: "تنظیم اسپرد",
				},
			},
		} as any;
	}

	describe("Validation & Utility functions", () => {
		it("validates spread percentages between 0 and 10", () => {
			expect(isValidSpreadInput("0")).toBe(true);
			expect(isValidSpreadInput("0.00")).toBe(true);
			expect(isValidSpreadInput("1.5")).toBe(true);
			expect(isValidSpreadInput("1.50")).toBe(true);
			expect(isValidSpreadInput("2")).toBe(true);
			expect(isValidSpreadInput("10")).toBe(true);
			expect(isValidSpreadInput("10.00")).toBe(true);
			expect(isValidSpreadInput("۱.۵")).toBe(true); // Persian digits

			expect(isValidSpreadInput("")).toBe(false);
			expect(isValidSpreadInput("-1")).toBe(false);
			expect(isValidSpreadInput("-0.5")).toBe(false);
			expect(isValidSpreadInput("10.01")).toBe(false);
			expect(isValidSpreadInput("15")).toBe(false);
			expect(isValidSpreadInput("abc")).toBe(false);
			expect(isValidSpreadInput("1.234")).toBe(false); // more than 2 decimals
		});

		it("cleans spread input by normalizing Persian/Arabic digits and removing spaces/percent signs", () => {
			expect(cleanSpreadInput("  1.5%  ")).toBe("1.5");
			expect(cleanSpreadInput("۱.۵٪")).toBe("1.5");
			expect(cleanSpreadInput("۲")).toBe("2");
		});

		it("calculates spread calculation example accurately with Decimal.js", () => {
			// 90,500 * (1 + 1.5/100) = 90,500 * 1.015 = 91,857.5 -> round to 91,858 (or 91,857 depending on rounding)
			const example = calculateSpreadExample("1.50", 90500);
			expect(example.baseTmn).toBe(90500);
			expect(Math.abs(example.buyerPaysTmn - 91858)).toBeLessThanOrEqual(1);

			const zeroExample = calculateSpreadExample("0.00", 90500);
			expect(zeroExample.buyerPaysTmn).toBe(90500);

			const tenExample = calculateSpreadExample("10.00", 90500);
			expect(tenExample.buyerPaysTmn).toBe(99550);
		});
	});

	describe("Bot conversation flow", () => {
		function createTestBot() {
			const repliedMessages: string[] = [];
			const { fetch: mockFetch } = createMockFetch(repliedMessages);
			const bot = createBot({
				token: "test_token",
				dbClient: db,
				adminIds: `${adminChatId}`,
				client: {
					fetch: mockFetch,
				},
				botInfo: {
					id: 1000,
					is_bot: true,
					first_name: "TeleBot",
					username: "tele_bot",
					can_join_groups: true,
					can_read_all_group_messages: false,
					supports_inline_queries: false,
				} as any,
			});
			return { bot, repliedMessages };
		}

		it("walks Admin through complete spread config flow and shows calculation example", async () => {
			const { bot, repliedMessages } = createTestBot();

			// Step 1: Send /spread
			await bot.handleUpdate(makeMessageUpdate(1, adminChatId, "/spread"));

			expect(repliedMessages).toHaveLength(1);
			expect(repliedMessages[0]).toContain("تنظیم اسپرد");
			expect(repliedMessages[0]).toContain("اسپرد فعلی");

			// Step 2: Send valid spread
			await bot.handleUpdate(makeMessageUpdate(2, adminChatId, "1.5"));

			expect(repliedMessages).toHaveLength(2);
			expect(repliedMessages[1]).toContain("با موفقیت روی 1.50% تنظیم شد");
			expect(repliedMessages[1]).toContain("مثال محاسبه");
			expect(repliedMessages[1]).toContain("90,500");

			// Verify DB state
			const config = await configService.getConfig();
			expect(config.spreadPercent).toBe("1.50");
			expect(config.updatedByAdminTelegramId).toBe(BigInt(adminChatId));
		});

		it('triggers conversation when clicking menu button "📊 تنظیم اسپرد"', async () => {
			const { bot, repliedMessages } = createTestBot();

			await bot.handleUpdate(makeMessageUpdate(1, adminChatId, "📊 تنظیم اسپرد"));

			expect(repliedMessages).toHaveLength(1);
			expect(repliedMessages[0]).toContain("تنظیم اسپرد");

			await bot.handleUpdate(makeMessageUpdate(2, adminChatId, "2.0"));

			expect(repliedMessages).toHaveLength(2);
			expect(repliedMessages[1]).toContain("با موفقیت روی 2.00% تنظیم شد");

			const config = await configService.getConfig();
			expect(config.spreadPercent).toBe("2.00");
		});

		it("re-prompts on invalid input before accepting valid spread", async () => {
			const { bot, repliedMessages } = createTestBot();

			await bot.handleUpdate(makeMessageUpdate(1, adminChatId, "/spread"));
			expect(repliedMessages).toHaveLength(1);

			// Invalid input (out of range > 10)
			await bot.handleUpdate(makeMessageUpdate(2, adminChatId, "15"));
			expect(repliedMessages).toHaveLength(2);
			expect(repliedMessages[1]).toContain("نامعتبر است");

			// Invalid input (negative)
			await bot.handleUpdate(makeMessageUpdate(3, adminChatId, "-1"));
			expect(repliedMessages).toHaveLength(3);
			expect(repliedMessages[2]).toContain("نامعتبر است");

			// Valid input
			await bot.handleUpdate(makeMessageUpdate(4, adminChatId, "0.5"));
			expect(repliedMessages).toHaveLength(4);
			expect(repliedMessages[3]).toContain("با موفقیت روی 0.50% تنظیم شد");

			const config = await configService.getConfig();
			expect(config.spreadPercent).toBe("0.50");
		});

		it("cancels conversation when /cancel is sent", async () => {
			const { bot, repliedMessages } = createTestBot();

			await bot.handleUpdate(makeMessageUpdate(1, adminChatId, "/spread"));
			await bot.handleUpdate(makeMessageUpdate(2, adminChatId, "/cancel"));

			expect(repliedMessages).toHaveLength(2);
			expect(repliedMessages[1]).toContain("لغو شد");
		});

		it("cancels conversation when cancel callback is sent", async () => {
			const { bot, repliedMessages } = createTestBot();

			await bot.handleUpdate(makeMessageUpdate(1, adminChatId, "/spread"));
			await bot.handleUpdate(makeCallbackQueryUpdate(2, adminChatId, "flow:cancel"));

			expect(repliedMessages).toHaveLength(2);
			expect(repliedMessages[1]).toContain("لغو شد");
		});

		it("silently ignores /spread when sent by a non-Admin", async () => {
			const nonAdminChatId = 999888777;
			const { bot, repliedMessages } = createTestBot();

			await bot.handleUpdate(makeMessageUpdate(1, nonAdminChatId, "/spread", "Buyer"));

			expect(repliedMessages).toHaveLength(0);
		});
	});
});
