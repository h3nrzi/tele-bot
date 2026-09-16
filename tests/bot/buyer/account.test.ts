import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setupTestDatabase } from "@tests/helpers/test-db";
import { createMockFetch } from "@tests/helpers/mock-context";
import { createBot } from "@/bot/bot";
import {
	createTestBuyer,
	createTestCatalogItem,
	placeTestOrder,
	claimTestOrder,
	fulfilTestOrder,
	cancelTestOrder,
	setTestRate,
	initiateTestTopUp,
} from "@tests/helpers/fixtures";
import { buildProfileCardView, ACCOUNT_CALLBACKS } from "@/bot/buyer/keyboards/account.keyboards";
import { Buyer } from "@/modules/buyer/buyer.entity";
import { TopUpRequest } from "@/modules/top-up/top-up-request.entity";
import { TopUpService } from "@/modules/top-up/top-up.service";

describe("Buyer Account Hub — Profile Card (Ticket 03)", () => {
	const { db, container } = setupTestDatabase();
	const buyerChatId = 987654321;
	const adminChatId = 123456789;
	const originalEnv = process.env.ADMIN_IDS;
	const originalMinUsd = process.env.TOPUP_MIN_USD;
	const originalMaxUsd = process.env.TOPUP_MAX_USD;

	beforeEach(() => {
		process.env.ADMIN_IDS = `${adminChatId}`;
		process.env.TOPUP_MIN_USD = "10.00";
		process.env.TOPUP_MAX_USD = "1000.00";
	});

	afterEach(() => {
		process.env.ADMIN_IDS = originalEnv;
		process.env.TOPUP_MIN_USD = originalMinUsd;
		process.env.TOPUP_MAX_USD = originalMaxUsd;
	});

	function makeMessageUpdate(
		updateId: number,
		chatId: number,
		text: string,
		senderName = "Buyer",
		username = "buyer_user",
	) {
		const isCommand = text.startsWith("/");
		const commandLength = text.indexOf(" ") > 0 ? text.indexOf(" ") : text.length;

		const message: Record<string, unknown> = {
			message_id: updateId,
			date: Math.floor(Date.now() / 1000),
			chat: { id: chatId, type: "private", first_name: senderName },
			from: { id: chatId, is_bot: false, first_name: senderName, username },
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

	function makeCallbackQueryUpdate(
		updateId: number,
		chatId: number,
		data: string,
		messageId = 1,
		senderName = "Buyer",
		username = "buyer_user",
	) {
		return {
			update_id: updateId,
			callback_query: {
				id: `cb_${updateId}`,
				from: { id: chatId, is_bot: false, first_name: senderName, username },
				message: {
					message_id: messageId,
					date: Math.floor(Date.now() / 1000),
					chat: { id: chatId, type: "private", first_name: senderName },
					text: "👤 حساب کاربری",
				},
				chat_instance: "test_instance",
				data,
			},
		} as any;
	}

	function createTestBot() {
		const repliedMessages: string[] = [];
		const editedMessages: any[] = [];
		const answeredCallbackQueries: any[] = [];
		const sentMessages: any[] = [];
		const { fetch: mockFetch } = createMockFetch(
			repliedMessages,
			[],
			editedMessages,
			answeredCallbackQueries,
			sentMessages,
		);
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
		return {
			bot,
			repliedMessages,
			editedMessages,
			answeredCallbackQueries,
			sentMessages,
		};
	}

	describe("Unit: buildProfileCardView", () => {
		it("renders identity, balance, and order breakdown with navigation buttons", () => {
			const buyer = new Buyer({
				id: "buyer-1",
				telegramChatId: 987654321n,
				telegramUsername: "test_user",
				createdAt: new Date("2025-01-15T12:00:00Z"),
			});

			const { messageText, keyboard } = buildProfileCardView({
				buyer,
				availableBalance: "125.50",
				orderCounts: { fulfilled: 3, inProgress: 2, cancelled: 1 },
			});

			expect(messageText).toContain("👤 *حساب کاربری*");
			expect(messageText).toContain("987654321");
			expect(messageText).toContain("test\\_user");
			expect(messageText).toContain("$125.50");
			expect(messageText).toContain("✅ تکمیل شده: 3");
			expect(messageText).toContain("⏳ در حال پردازش: 2");
			expect(messageText).toContain("❌ لغو شده: 1");

			const flatButtons = keyboard.inline_keyboard.flat() as any[];
			expect(flatButtons.some((b) => b.callback_data === ACCOUNT_CALLBACKS.ORDERS)).toBe(true);
			expect(flatButtons.some((b) => b.callback_data === ACCOUNT_CALLBACKS.TRANSACTIONS)).toBe(true);
			expect(flatButtons.some((b) => b.callback_data === ACCOUNT_CALLBACKS.TOPUP_CANCEL)).toBe(false);
		});

		it("renders INITIATED top-up instructions with no cancel button", () => {
			const buyer = new Buyer({
				id: "buyer-1",
				telegramChatId: 987654321n,
				telegramUsername: "test_user",
				createdAt: new Date("2025-01-15T12:00:00Z"),
			});

			const initiatedTopUp = new TopUpRequest({
				id: "topup-1",
				userId: "buyer-1",
				exchangeRateId: "rate-1",
				lockedIrrPerUsd: 600000n,
				rateSource: "MANUAL",
				usdAmount: "50.00",
				irrAmount: 30000000n,
				status: "INITIATED",
				expiresAt: new Date(Date.now() + 1800000),
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const { messageText, keyboard } = buildProfileCardView({
				buyer,
				availableBalance: "0.00",
				orderCounts: { fulfilled: 0, inProgress: 0, cancelled: 0 },
				activeTopUp: initiatedTopUp,
			});

			expect(messageText).toContain("درخواست افزایش موجودی در انتظار پرداخت");
			expect(messageText).toContain("$50.00");
			expect(messageText).toContain("رسید پرداخت بانکی");

			const flatButtons = keyboard.inline_keyboard.flat() as any[];
			expect(flatButtons.some((b) => b.callback_data === ACCOUNT_CALLBACKS.TOPUP_CANCEL)).toBe(false);
		});

		it("renders PENDING top-up copy with inline [❌ لغو درخواست] button", () => {
			const buyer = new Buyer({
				id: "buyer-1",
				telegramChatId: 987654321n,
				telegramUsername: "test_user",
				createdAt: new Date("2025-01-15T12:00:00Z"),
			});

			const pendingTopUp = new TopUpRequest({
				id: "topup-2",
				userId: "buyer-1",
				exchangeRateId: "rate-1",
				lockedIrrPerUsd: 600000n,
				rateSource: "MANUAL",
				usdAmount: "100.00",
				irrAmount: 60000000n,
				status: "PENDING",
				receiptFileId: "receipt_file_123",
				expiresAt: new Date(Date.now() + 1800000),
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const { messageText, keyboard } = buildProfileCardView({
				buyer,
				availableBalance: "0.00",
				orderCounts: { fulfilled: 0, inProgress: 0, cancelled: 0 },
				activeTopUp: pendingTopUp,
			});

			expect(messageText).toContain("درخواست افزایش موجودی در انتظار بررسی");
			expect(messageText).toContain("$100.00");
			expect(messageText).toContain("در حال بررسی توسط ادمین است");

			const flatButtons = keyboard.inline_keyboard.flat() as any[];
			const cancelBtn = flatButtons.find((b) => b.callback_data === ACCOUNT_CALLBACKS.TOPUP_CANCEL);
			expect(cancelBtn).toBeDefined();
			expect(cancelBtn.text).toContain("لغو درخواست");
		});
	});

	describe("Integration: /account and '👤 حساب کاربری' bot routing", () => {
		it("routes /account command to Profile Card with correct buyer details", async () => {
			const { buyer } = await createTestBuyer(container, {
				telegramChatId: buyerChatId,
				telegramUsername: "alice_account",
			});

			const { bot, repliedMessages, sentMessages } = createTestBot();

			await bot.handleUpdate(makeMessageUpdate(1, buyerChatId, "/account", "Alice", "alice_account"));

			expect(repliedMessages).toHaveLength(1);
			expect(repliedMessages[0]).toContain("حساب کاربری");
			expect(repliedMessages[0]).toContain(buyerChatId.toString());
			expect(repliedMessages[0]).toContain("alice\\_account");
			expect(repliedMessages[0]).toContain("$0.00");
			expect(repliedMessages[0]).toContain("✅ تکمیل شده: 0");
			expect(repliedMessages[0]).toContain("⏳ در حال پردازش: 0");
			expect(repliedMessages[0]).toContain("❌ لغو شده: 0");

			// Check keyboard
			const lastMessage = sentMessages[0];
			expect(lastMessage?.reply_markup?.inline_keyboard).toBeDefined();
			const flatButtons = lastMessage.reply_markup.inline_keyboard.flat();
			expect(flatButtons.some((b: any) => b.callback_data === ACCOUNT_CALLBACKS.ORDERS)).toBe(true);
			expect(flatButtons.some((b: any) => b.callback_data === ACCOUNT_CALLBACKS.TRANSACTIONS)).toBe(true);
		});

		it("routes '👤 حساب کاربری' button text to Profile Card identically", async () => {
			await createTestBuyer(container, {
				telegramChatId: buyerChatId,
				telegramUsername: "bob_account",
			});

			const { bot, repliedMessages } = createTestBot();

			await bot.handleUpdate(makeMessageUpdate(2, buyerChatId, "👤 حساب کاربری", "Bob", "bob_account"));

			expect(repliedMessages).toHaveLength(1);
			expect(repliedMessages[0]).toContain("حساب کاربری");
			expect(repliedMessages[0]).toContain("bob\\_account");
		});

		it("displays accurate order breakdown counts across all status buckets", async () => {
			const { buyer } = await createTestBuyer(container, {
				telegramChatId: buyerChatId,
				telegramUsername: "carol_account",
			});

			// Credit buyer balance to place orders
			await setTestRate(container, adminChatId, 600000n);
			const topUpService = container.resolve(TopUpService);
			const { request: topUp1 } = await topUpService.initiateTopUp({
				userId: buyer.id,
				usdAmount: "500.00",
			});
			await topUpService.submitReceipt({ userId: buyer.id, fileId: "r1" });
			await topUpService.approveTopUp({ topUpRequestId: topUp1.id, adminTelegramId: BigInt(adminChatId) });

			// Create catalog items
			const itemA = await createTestCatalogItem(container, {
				name: "Service A",
				usdPrice: "20.00",
			});
			const itemB = await createTestCatalogItem(container, {
				name: "Service B",
				usdPrice: "30.00",
			});

			// Order 1: FULFILLED
			const { order: o1 } = await placeTestOrder(container, {
				userId: buyer.id,
				catalogItemId: itemA.id,
			});
			await claimTestOrder(container, { orderId: o1.id, adminTelegramId: BigInt(adminChatId) });
			await fulfilTestOrder(container, {
				orderId: o1.id,
				adminTelegramId: BigInt(adminChatId),
				deliveryContent: "license_key_1",
			});

			// Order 2: PLACED (inProgress)
			await placeTestOrder(container, {
				userId: buyer.id,
				catalogItemId: itemA.id,
			});

			// Order 3: PROCESSING (inProgress)
			const { order: o3 } = await placeTestOrder(container, {
				userId: buyer.id,
				catalogItemId: itemB.id,
			});
			await claimTestOrder(container, { orderId: o3.id, adminTelegramId: BigInt(adminChatId) });

			// Order 4: CANCELLED
			const { order: o4 } = await placeTestOrder(container, {
				userId: buyer.id,
				catalogItemId: itemA.id,
			});
			await cancelTestOrder(container, { orderId: o4.id, telegramChatId: buyerChatId });

			const { bot, repliedMessages } = createTestBot();

			await bot.handleUpdate(makeMessageUpdate(3, buyerChatId, "/account", "Carol", "carol_account"));

			expect(repliedMessages).toHaveLength(1);
			expect(repliedMessages[0]).toContain("✅ تکمیل شده: 1");
			expect(repliedMessages[0]).toContain("⏳ در حال پردازش: 2");
			expect(repliedMessages[0]).toContain("❌ لغو شده: 1");
		});

		it("renders INITIATED top-up alert with no cancel button", async () => {
			const { buyer } = await createTestBuyer(container, {
				telegramChatId: buyerChatId,
				telegramUsername: "dan_account",
			});

			await setTestRate(container, adminChatId, 600000n);
			await initiateTestTopUp(container, {
				userId: buyer.id,
				usdAmount: "75.00",
			});

			const { bot, repliedMessages, sentMessages } = createTestBot();

			await bot.handleUpdate(makeMessageUpdate(4, buyerChatId, "/account", "Dan", "dan_account"));

			expect(repliedMessages).toHaveLength(1);
			expect(repliedMessages[0]).toContain("درخواست افزایش موجودی در انتظار پرداخت");
			expect(repliedMessages[0]).toContain("$75.00");

			const lastMessage = sentMessages[0];
			const flatButtons = lastMessage.reply_markup.inline_keyboard.flat();
			expect(flatButtons.some((b: any) => b.callback_data === ACCOUNT_CALLBACKS.TOPUP_CANCEL)).toBe(false);
		});

		it("renders PENDING top-up alert with inline [❌ لغو درخواست] button", async () => {
			const { buyer } = await createTestBuyer(container, {
				telegramChatId: buyerChatId,
				telegramUsername: "eva_account",
			});

			await setTestRate(container, adminChatId, 600000n);
			const topUpService = container.resolve(TopUpService);
			await topUpService.initiateTopUp({
				userId: buyer.id,
				usdAmount: "100.00",
			});
			await topUpService.submitReceipt({ userId: buyer.id, fileId: "receipt_eva" });

			const { bot, repliedMessages, sentMessages } = createTestBot();

			await bot.handleUpdate(makeMessageUpdate(5, buyerChatId, "/account", "Eva", "eva_account"));

			expect(repliedMessages).toHaveLength(1);
			expect(repliedMessages[0]).toContain("درخواست افزایش موجودی در انتظار بررسی");
			expect(repliedMessages[0]).toContain("$100.00");

			const lastMessage = sentMessages[0];
			const flatButtons = lastMessage.reply_markup.inline_keyboard.flat();
			const cancelBtn = flatButtons.find((b: any) => b.callback_data === ACCOUNT_CALLBACKS.TOPUP_CANCEL);
			expect(cancelBtn).toBeDefined();
			expect(cancelBtn.text).toContain("لغو درخواست");
		});

		it("tapping [❌ لغو درخواست] triggers the cancel callback and alerts user if receipt submitted", async () => {
			const { buyer } = await createTestBuyer(container, {
				telegramChatId: buyerChatId,
				telegramUsername: "frank_account",
			});

			await setTestRate(container, adminChatId, 600000n);
			const topUpService = container.resolve(TopUpService);
			await topUpService.initiateTopUp({
				userId: buyer.id,
				usdAmount: "50.00",
			});
			await topUpService.submitReceipt({ userId: buyer.id, fileId: "receipt_frank" });

			const { bot, answeredCallbackQueries } = createTestBot();

			await bot.handleUpdate(
				makeCallbackQueryUpdate(6, buyerChatId, ACCOUNT_CALLBACKS.TOPUP_CANCEL, 1, "Frank", "frank_account"),
			);

			expect(answeredCallbackQueries).toHaveLength(1);
			expect(answeredCallbackQueries[0].text).toContain("امکان لغو این درخواست وجود ندارد");
			expect(answeredCallbackQueries[0].show_alert).toBe(true);
		});

		it("prompts unregistered buyer to send /start", async () => {
			const unknownChatId = 999111222;
			const { bot, repliedMessages } = createTestBot();

			await bot.handleUpdate(makeMessageUpdate(7, unknownChatId, "/account", "Stranger", "stranger"));

			expect(repliedMessages).toHaveLength(1);
			expect(repliedMessages[0]).toContain("/start");
		});
	});
});
