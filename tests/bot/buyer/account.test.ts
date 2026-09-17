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
	rejectTestOrder,
	cancelTestOrder,
	setTestRate,
	initiateTestTopUp,
} from "@tests/helpers/fixtures";
import { wallets } from "@/modules/wallet/wallet.schema";
import { orders } from "@/modules/order/order.schema";
import { topUpRequests } from "@/modules/top-up/top-up.schema";
import { eq } from "drizzle-orm";
import {
	buildProfileCardView,
	buildOrderHistoryListView,
	buildOrderDetailView,
	buildTransactionHistoryView,
	ACCOUNT_CALLBACKS,
	ORDER_STATUS_EMOJIS,
} from "@/bot/buyer/keyboards/account.keyboards";
import { Buyer } from "@/modules/buyer/buyer.entity";
import { Order } from "@/modules/order/order.entity";
import { CatalogItem } from "@/modules/catalog/catalog.entity";
import { TopUpRequest } from "@/modules/top-up/top-up-request.entity";
import { TopUpService } from "@/modules/top-up/top-up.service";
import { LedgerEntry } from "@/modules/ledger/entities/ledger-entry.entity";
import type { ILedgerRepository } from "@/modules/ledger/ledger.repository.interface";
import { TOKENS } from "@/core/di/tokens";
import { formatPersianDate } from "@/core/shared/date.utils";

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

	describe("Unit: buildOrderHistoryListView (Ticket 04)", () => {
		it("renders empty-state message prompting to visit shop when orders list is empty", () => {
			const { messageText, keyboard } = buildOrderHistoryListView([]);

			expect(messageText).toContain("هیچ سفارشی ثبت نکرده‌اید");
			expect(messageText).toContain("فروشگاه");

			const flatButtons = keyboard.inline_keyboard.flat() as any[];
			const backBtn = flatButtons.find((b) => b.callback_data === ACCOUNT_CALLBACKS.PROFILE);
			expect(backBtn).toBeDefined();
			expect(backBtn.text).toContain("بازگشت به پروفایل");
		});

		it("renders up to 5 order buttons with correct emoji, service name, and date", () => {
			const ordersList = [
				{
					order: new Order({
						id: "order-1",
						userId: "buyer-1",
						catalogItemId: "cat-1",
						usdPriceSnapshot: "10.00",
						status: "FULFILLED",
						createdAt: new Date("2025-06-01T12:00:00Z"),
						updatedAt: new Date("2025-06-01T12:00:00Z"),
					}),
					catalogItemName: "Service 1",
				},
				{
					order: new Order({
						id: "order-2",
						userId: "buyer-1",
						catalogItemId: "cat-2",
						usdPriceSnapshot: "20.00",
						status: "PLACED",
						createdAt: new Date("2025-06-02T12:00:00Z"),
						updatedAt: new Date("2025-06-02T12:00:00Z"),
					}),
					catalogItemName: "Service 2",
				},
			];

			const { messageText, keyboard } = buildOrderHistoryListView(ordersList);

			expect(messageText).toContain("تاریخچه سفارش");

			const flatButtons = keyboard.inline_keyboard.flat() as any[];
			const orderButtons = flatButtons.filter((b) => b.callback_data.startsWith(ACCOUNT_CALLBACKS.ORDER_PREFIX));
			expect(orderButtons).toHaveLength(2);

			expect(orderButtons[0].callback_data).toBe("account:order:order-1");
			expect(orderButtons[0].text).toContain("✅");
			expect(orderButtons[0].text).toContain("Service 1");
			expect(orderButtons[0].text).toContain("—");

			expect(orderButtons[1].callback_data).toBe("account:order:order-2");
			expect(orderButtons[1].text).toContain("⏳");
			expect(orderButtons[1].text).toContain("Service 2");

			const backBtn = flatButtons.find((b) => b.callback_data === ACCOUNT_CALLBACKS.PROFILE);
			expect(backBtn).toBeDefined();
		});

		it("caps display at 5 most recent orders when more than 5 exist", () => {
			const manyOrders = Array.from({ length: 7 }, (_, i) => ({
				order: new Order({
					id: `order-${i + 1}`,
					userId: "buyer-1",
					catalogItemId: `cat-${i + 1}`,
					usdPriceSnapshot: "10.00",
					status: "PLACED",
					createdAt: new Date(),
					updatedAt: new Date(),
				}),
				catalogItemName: `Service ${i + 1}`,
			}));

			const { keyboard } = buildOrderHistoryListView(manyOrders);

			const flatButtons = keyboard.inline_keyboard.flat() as any[];
			const orderButtons = flatButtons.filter((b) => b.callback_data.startsWith(ACCOUNT_CALLBACKS.ORDER_PREFIX));
			expect(orderButtons).toHaveLength(5);
			expect(orderButtons.map((b) => b.callback_data)).toEqual([
				"account:order:order-1",
				"account:order:order-2",
				"account:order:order-3",
				"account:order:order-4",
				"account:order:order-5",
			]);
		});
	});

	describe("Unit: buildOrderDetailView (Ticket 04)", () => {
		it("renders full details and Cancel button when status is PLACED", () => {
			const order = new Order({
				id: "12345678-1234-1234-1234-123456789abc",
				userId: "buyer-1",
				catalogItemId: "cat-1",
				usdPriceSnapshot: "25.00",
				status: "PLACED",
				createdAt: new Date("2025-06-01T10:00:00Z"),
				updatedAt: new Date("2025-06-01T10:00:00Z"),
			});
			const catalogItem = new CatalogItem({
				id: "cat-1",
				name: "Telegram Premium 1 Year",
				description: null,
				usdPrice: "25.00",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const { messageText, keyboard, hasCancelButton } = buildOrderDetailView({ order, catalogItem });

			expect(messageText).toContain("Telegram Premium 1 Year");
			expect(messageText).toContain("$25.00");
			expect(messageText).toContain("ثبت شده");
			expect(messageText).toContain(order.id);
			expect(hasCancelButton).toBe(true);

			const flatButtons = keyboard.inline_keyboard.flat() as any[];
			const cancelBtn = flatButtons.find((b) => b.callback_data === `order:cancel:${order.id}`);
			expect(cancelBtn).toBeDefined();
			expect(cancelBtn.text).toContain("لغو سفارش");

			const backBtn = flatButtons.find((b) => b.callback_data === ACCOUNT_CALLBACKS.ORDERS);
			expect(backBtn).toBeDefined();
			expect(backBtn.text).toContain("بازگشت به لیست");
		});

		it("renders read-only detail without Cancel button when status is PROCESSING", () => {
			const order = new Order({
				id: "order-proc-1",
				userId: "buyer-1",
				catalogItemId: "cat-1",
				usdPriceSnapshot: "15.00",
				status: "PROCESSING",
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const { messageText, keyboard, hasCancelButton } = buildOrderDetailView({ order, catalogItem: null });

			expect(messageText).toContain("امکان لغو آن وجود ندارد");
			expect(hasCancelButton).toBe(false);

			const flatButtons = keyboard.inline_keyboard.flat() as any[];
			expect(flatButtons.some((b) => b.callback_data.startsWith("order:cancel:"))).toBe(false);
			expect(flatButtons.some((b) => b.callback_data === ACCOUNT_CALLBACKS.ORDERS)).toBe(true);
		});

		it("renders delivery content for FULFILLED order and no cancel button", () => {
			const order = new Order({
				id: "order-ful-1",
				userId: "buyer-1",
				catalogItemId: "cat-1",
				usdPriceSnapshot: "15.00",
				status: "FULFILLED",
				deliveryContent: "license_key_xyz",
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const { messageText, keyboard, hasCancelButton } = buildOrderDetailView({ order, catalogItem: null });

			expect(messageText).toContain("مشخصات تحویل");
			expect(messageText).toContain("license\\_key\\_xyz");
			expect(hasCancelButton).toBe(false);

			const flatButtons = keyboard.inline_keyboard.flat() as any[];
			expect(flatButtons.some((b) => b.callback_data.startsWith("order:cancel:"))).toBe(false);
			expect(flatButtons.some((b) => b.callback_data === ACCOUNT_CALLBACKS.ORDERS)).toBe(true);
		});

		it("renders rejection category and note for REJECTED order and no cancel button", () => {
			const order = new Order({
				id: "order-rej-1",
				userId: "buyer-1",
				catalogItemId: "cat-1",
				usdPriceSnapshot: "15.00",
				status: "REJECTED",
				rejectionCategory: "OUT_OF_STOCK",
				rejectionNote: "supplier_offline",
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const { messageText, keyboard, hasCancelButton } = buildOrderDetailView({ order, catalogItem: null });

			expect(messageText).toContain("علت رد سفارش: عدم موجودی / ناموجود موقت");
			expect(messageText).toContain("supplier\\_offline");
			expect(hasCancelButton).toBe(false);

			const flatButtons = keyboard.inline_keyboard.flat() as any[];
			expect(flatButtons.some((b) => b.callback_data.startsWith("order:cancel:"))).toBe(false);
			expect(flatButtons.some((b) => b.callback_data === ACCOUNT_CALLBACKS.ORDERS)).toBe(true);
		});

		it("renders detail for CANCELLED order and no cancel button", () => {
			const order = new Order({
				id: "order-canc-1",
				userId: "buyer-1",
				catalogItemId: "cat-1",
				usdPriceSnapshot: "15.00",
				status: "CANCELLED",
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const { messageText, keyboard, hasCancelButton } = buildOrderDetailView({ order, catalogItem: null });

			expect(messageText).toContain("لغو شده");
			expect(hasCancelButton).toBe(false);

			const flatButtons = keyboard.inline_keyboard.flat() as any[];
			expect(flatButtons.some((b) => b.callback_data.startsWith("order:cancel:"))).toBe(false);
			expect(flatButtons.some((b) => b.callback_data === ACCOUNT_CALLBACKS.ORDERS)).toBe(true);
		});
	});

	describe("Unit: buildTransactionHistoryView (Ticket 05)", () => {
		it("renders empty-state message and back button when transactions array is empty", () => {
			const { messageText, keyboard, isEmpty } = buildTransactionHistoryView([]);

			expect(isEmpty).toBe(true);
			expect(messageText).toContain("تاریخچه تراکنش‌ها");
			expect(messageText).toContain("شما تاکنون هیچ تراکنشی نداشته‌اید");

			const flatButtons = keyboard.inline_keyboard.flat() as any[];
			expect(flatButtons).toHaveLength(1);
			expect(flatButtons[0].callback_data).toBe(ACCOUNT_CALLBACKS.PROFILE);
			expect(flatButtons[0].text).toContain("بازگشت به پروفایل");
		});

		it("renders credit entry with ➕, +$<amount>, narrative, and Persian date", () => {
			const creditEntry = new LedgerEntry({
				id: "entry-1",
				ledgerTransactionId: "tx-1",
				accountType: "BUYER_WALLET",
				direction: "CREDIT",
				usdAmount: "50.00",
				walletId: "wallet-1",
				createdAt: new Date("2026-06-15T12:00:00Z"),
			});

			const { messageText, keyboard, isEmpty } = buildTransactionHistoryView([
				{ entry: creditEntry, narrative: "شارژ حساب کاربری" },
			]);

			expect(isEmpty).toBe(false);
			expect(messageText).toContain("تاریخچه تراکنش‌های شما");
			expect(messageText).toContain("➕ شارژ حساب کاربری: +$50.00");
			expect(messageText).toContain(formatPersianDate(creditEntry.createdAt));

			const flatButtons = keyboard.inline_keyboard.flat() as any[];
			expect(flatButtons).toHaveLength(1);
			expect(flatButtons[0].callback_data).toBe(ACCOUNT_CALLBACKS.PROFILE);
			expect(flatButtons[0].text).toContain("بازگشت به پروفایل");
		});

		it("renders debit entry with ➖, -$<amount>, narrative, and Persian date", () => {
			const debitEntry = new LedgerEntry({
				id: "entry-2",
				ledgerTransactionId: "tx-2",
				accountType: "BUYER_WALLET",
				direction: "DEBIT",
				usdAmount: "12.50",
				walletId: "wallet-1",
				createdAt: new Date("2026-06-16T12:00:00Z"),
			});

			const { messageText, isEmpty } = buildTransactionHistoryView([
				{ entry: debitEntry, narrative: "خرید اشتراک" },
			]);

			expect(isEmpty).toBe(false);
			expect(messageText).toContain("➖ خرید اشتراک: -$12.50");
			expect(messageText).toContain(formatPersianDate(debitEntry.createdAt));
		});

		it("caps displayed entries at 5 when more are provided", () => {
			const entries = Array.from({ length: 7 }, (_, i) => ({
				entry: new LedgerEntry({
					id: `entry-${i}`,
					ledgerTransactionId: `tx-${i}`,
					accountType: "BUYER_WALLET",
					direction: i % 2 === 0 ? "CREDIT" : "DEBIT",
					usdAmount: `${(i + 1) * 10}.00`,
					walletId: "wallet-1",
					createdAt: new Date(2026, 0, i + 1),
				}),
				narrative: `تراکنش شماره ${i + 1}`,
			}));

			const { messageText } = buildTransactionHistoryView(entries);

			expect(messageText).toContain("تراکنش شماره 1");
			expect(messageText).toContain("تراکنش شماره 5");
			expect(messageText).not.toContain("تراکنش شماره 6");
			expect(messageText).not.toContain("تراکنش شماره 7");
		});

		it("escapes markdown characters in narrative", () => {
			const entry = new LedgerEntry({
				id: "entry-special",
				ledgerTransactionId: "tx-special",
				accountType: "BUYER_WALLET",
				direction: "DEBIT",
				usdAmount: "10.00",
				walletId: "wallet-1",
				createdAt: new Date(),
			});

			const { messageText } = buildTransactionHistoryView([
				{ entry, narrative: "Order_special [test] *bold*" },
			]);

			expect(messageText).toContain("Order\\_special \\[test] \\*bold\\*");
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

	describe("Integration: Order History & Detail View Bot Routing (Ticket 04)", () => {
		it("account:orders callback edits message to 5-order history list with correct buttons", async () => {
			const { buyer, wallet } = await createTestBuyer(container, {
				telegramChatId: buyerChatId,
				telegramUsername: "history_user",
			});

			await db.update(wallets).set({ availableBalance: "500.00" }).where(eq(wallets.id, wallet.id));

			const itemA = await createTestCatalogItem(container, {
				name: "Spotify Premium 1 Year",
				usdPrice: "14.99",
				isActive: true,
			});
			const itemB = await createTestCatalogItem(container, {
				name: "Netflix 1 Month",
				usdPrice: "12.00",
				isActive: true,
			});

			const { order: order1 } = await placeTestOrder(container, {
				userId: buyer.id,
				catalogItemId: itemA.id,
			});
			const { order: order2 } = await placeTestOrder(container, {
				userId: buyer.id,
				catalogItemId: itemB.id,
			});

			const { bot, editedMessages, answeredCallbackQueries } = createTestBot();

			await bot.handleUpdate(
				makeCallbackQueryUpdate(10, buyerChatId, ACCOUNT_CALLBACKS.ORDERS, 1, "History", "history_user"),
			);

			expect(answeredCallbackQueries).toHaveLength(1);
			expect(editedMessages).toHaveLength(1);
			expect(editedMessages[0].text).toContain("تاریخچه سفارش");

			const flatButtons = editedMessages[0].reply_markup.inline_keyboard.flat() as any[];
			const orderButtons = flatButtons.filter((b) => b.callback_data.startsWith(ACCOUNT_CALLBACKS.ORDER_PREFIX));
			expect(orderButtons).toHaveLength(2);

			expect(orderButtons.some((b) => b.callback_data === `account:order:${order1.id}`)).toBe(true);
			expect(orderButtons.some((b) => b.callback_data === `account:order:${order2.id}`)).toBe(true);
			expect(orderButtons.some((b) => b.text.includes("Spotify Premium 1 Year"))).toBe(true);
			expect(orderButtons.some((b) => b.text.includes("Netflix 1 Month"))).toBe(true);

			const backBtn = flatButtons.find((b) => b.callback_data === ACCOUNT_CALLBACKS.PROFILE);
			expect(backBtn).toBeDefined();
			expect(backBtn.text).toContain("بازگشت به پروفایل");
		});

		it("orders beyond 5 are capped and not shown in order history list", async () => {
			const { buyer, wallet } = await createTestBuyer(container, {
				telegramChatId: buyerChatId,
				telegramUsername: "capped_user",
			});

			await db.update(wallets).set({ availableBalance: "500.00" }).where(eq(wallets.id, wallet.id));

			const item = await createTestCatalogItem(container, {
				name: "Item Service",
				usdPrice: "5.00",
				isActive: true,
			});

			for (let i = 0; i < 7; i++) {
				await placeTestOrder(container, {
					userId: buyer.id,
					catalogItemId: item.id,
				});
			}

			const { bot, editedMessages } = createTestBot();

			await bot.handleUpdate(
				makeCallbackQueryUpdate(11, buyerChatId, ACCOUNT_CALLBACKS.ORDERS, 1, "Capped", "capped_user"),
			);

			expect(editedMessages).toHaveLength(1);
			const flatButtons = editedMessages[0].reply_markup.inline_keyboard.flat() as any[];
			const orderButtons = flatButtons.filter((b) => b.callback_data.startsWith(ACCOUNT_CALLBACKS.ORDER_PREFIX));
			expect(orderButtons).toHaveLength(5);
		});

		it("empty-state message shown when buyer has no orders", async () => {
			await createTestBuyer(container, {
				telegramChatId: buyerChatId,
				telegramUsername: "empty_user",
			});

			const { bot, editedMessages, answeredCallbackQueries } = createTestBot();

			await bot.handleUpdate(
				makeCallbackQueryUpdate(12, buyerChatId, ACCOUNT_CALLBACKS.ORDERS, 1, "Empty", "empty_user"),
			);

			expect(answeredCallbackQueries).toHaveLength(1);
			expect(editedMessages).toHaveLength(1);
			expect(editedMessages[0].text).toContain("هیچ سفارشی ثبت نکرده‌اید");
			expect(editedMessages[0].text).toContain("فروشگاه");

			const flatButtons = editedMessages[0].reply_markup.inline_keyboard.flat() as any[];
			const backBtn = flatButtons.find((b) => b.callback_data === ACCOUNT_CALLBACKS.PROFILE);
			expect(backBtn).toBeDefined();
		});

		it("account:order:<orderId> callback edits message to full detail view for PLACED order with cancel button", async () => {
			const { buyer, wallet } = await createTestBuyer(container, {
				telegramChatId: buyerChatId,
				telegramUsername: "placed_detail_user",
			});

			await db.update(wallets).set({ availableBalance: "100.00" }).where(eq(wallets.id, wallet.id));

			const item = await createTestCatalogItem(container, {
				name: "Telegram Premium 1 Year",
				usdPrice: "29.99",
				isActive: true,
			});

			const { order } = await placeTestOrder(container, {
				userId: buyer.id,
				catalogItemId: item.id,
			});

			const { bot, editedMessages, answeredCallbackQueries } = createTestBot();

			await bot.handleUpdate(
				makeCallbackQueryUpdate(
					13,
					buyerChatId,
					`account:order:${order.id}`,
					1,
					"Detail",
					"placed_detail_user",
				),
			);

			expect(answeredCallbackQueries).toHaveLength(1);
			expect(editedMessages).toHaveLength(1);

			const text = editedMessages[0].text;
			expect(text).toContain("Telegram Premium 1 Year");
			expect(text).toContain("$29.99");
			expect(text).toContain("ثبت شده");
			expect(text).toContain(order.id);

			const flatButtons = editedMessages[0].reply_markup.inline_keyboard.flat() as any[];
			const cancelBtn = flatButtons.find((b) => b.callback_data === `order:cancel:${order.id}`);
			expect(cancelBtn).toBeDefined();
			expect(cancelBtn.text).toContain("لغو سفارش");

			const backToListBtn = flatButtons.find((b) => b.callback_data === ACCOUNT_CALLBACKS.ORDERS);
			expect(backToListBtn).toBeDefined();
			expect(backToListBtn.text).toContain("بازگشت به لیست");
		});

		it("order detail view for PROCESSING order is read-only (no cancel button)", async () => {
			const { buyer, wallet } = await createTestBuyer(container, {
				telegramChatId: buyerChatId,
				telegramUsername: "proc_detail_user",
			});

			await db.update(wallets).set({ availableBalance: "100.00" }).where(eq(wallets.id, wallet.id));

			const item = await createTestCatalogItem(container, {
				name: "Netflix 1 Month",
				usdPrice: "15.00",
				isActive: true,
			});

			const { order } = await placeTestOrder(container, {
				userId: buyer.id,
				catalogItemId: item.id,
			});

			await claimTestOrder(container, {
				orderId: order.id,
				adminTelegramId: BigInt(adminChatId),
				adminUsername: "admin_user",
			});

			const { bot, editedMessages } = createTestBot();

			await bot.handleUpdate(
				makeCallbackQueryUpdate(
					14,
					buyerChatId,
					`account:order:${order.id}`,
					1,
					"Proc",
					"proc_detail_user",
				),
			);

			expect(editedMessages).toHaveLength(1);
			const text = editedMessages[0].text;
			expect(text).toContain("در حال پردازش");
			expect(text).toContain("امکان لغو آن وجود ندارد");

			const flatButtons = editedMessages[0].reply_markup.inline_keyboard.flat() as any[];
			expect(flatButtons.some((b) => b.callback_data.startsWith("order:cancel:"))).toBe(false);
			expect(flatButtons.some((b) => b.callback_data === ACCOUNT_CALLBACKS.ORDERS)).toBe(true);
		});

		it("order detail view for FULFILLED order displays delivery content (no cancel button)", async () => {
			const { buyer, wallet } = await createTestBuyer(container, {
				telegramChatId: buyerChatId,
				telegramUsername: "ful_detail_user",
			});

			await db.update(wallets).set({ availableBalance: "100.00" }).where(eq(wallets.id, wallet.id));

			const item = await createTestCatalogItem(container, {
				name: "Gift Card",
				usdPrice: "50.00",
				isActive: true,
			});

			const { order } = await placeTestOrder(container, {
				userId: buyer.id,
				catalogItemId: item.id,
			});

			await claimTestOrder(container, {
				orderId: order.id,
				adminTelegramId: BigInt(adminChatId),
			});
			await fulfilTestOrder(container, {
				orderId: order.id,
				adminTelegramId: BigInt(adminChatId),
				deliveryContent: "CODE-XYZ-12345",
			});

			const { bot, editedMessages } = createTestBot();

			await bot.handleUpdate(
				makeCallbackQueryUpdate(
					15,
					buyerChatId,
					`account:order:${order.id}`,
					1,
					"Fulfil",
					"ful_detail_user",
				),
			);

			expect(editedMessages).toHaveLength(1);
			const text = editedMessages[0].text;
			expect(text).toContain("تکمیل و تحویل داده شده");
			expect(text).toContain("CODE-XYZ-12345");

			const flatButtons = editedMessages[0].reply_markup.inline_keyboard.flat() as any[];
			expect(flatButtons.some((b) => b.callback_data.startsWith("order:cancel:"))).toBe(false);
			expect(flatButtons.some((b) => b.callback_data === ACCOUNT_CALLBACKS.ORDERS)).toBe(true);
		});

		it("order detail view for REJECTED order displays rejection details (no cancel button)", async () => {
			const { buyer, wallet } = await createTestBuyer(container, {
				telegramChatId: buyerChatId,
				telegramUsername: "rej_detail_user",
			});

			await db.update(wallets).set({ availableBalance: "100.00" }).where(eq(wallets.id, wallet.id));

			const item = await createTestCatalogItem(container, {
				name: "Rejected Service",
				usdPrice: "20.00",
				isActive: true,
			});

			const { order } = await placeTestOrder(container, {
				userId: buyer.id,
				catalogItemId: item.id,
			});

			await rejectTestOrder(container, {
				orderId: order.id,
				adminTelegramId: BigInt(adminChatId),
				rejectionCategory: "OUT_OF_STOCK",
				rejectionNote: "item_temporarily_unavailable",
			});

			const { bot, editedMessages } = createTestBot();

			await bot.handleUpdate(
				makeCallbackQueryUpdate(
					16,
					buyerChatId,
					`account:order:${order.id}`,
					1,
					"Rej",
					"rej_detail_user",
				),
			);

			expect(editedMessages).toHaveLength(1);
			const text = editedMessages[0].text;
			expect(text).toContain("رد شده");
			expect(text).toContain("عدم موجودی / ناموجود موقت");
			expect(text).toContain("item\\_temporarily\\_unavailable");

			const flatButtons = editedMessages[0].reply_markup.inline_keyboard.flat() as any[];
			expect(flatButtons.some((b) => b.callback_data.startsWith("order:cancel:"))).toBe(false);
			expect(flatButtons.some((b) => b.callback_data === ACCOUNT_CALLBACKS.ORDERS)).toBe(true);
		});

		it("order detail view for CANCELLED order displays cancelled status (no cancel button)", async () => {
			const { buyer, wallet } = await createTestBuyer(container, {
				telegramChatId: buyerChatId,
				telegramUsername: "canc_detail_user",
			});

			await db.update(wallets).set({ availableBalance: "100.00" }).where(eq(wallets.id, wallet.id));

			const item = await createTestCatalogItem(container, {
				name: "Cancelled Service",
				usdPrice: "20.00",
				isActive: true,
			});

			const { order } = await placeTestOrder(container, {
				userId: buyer.id,
				catalogItemId: item.id,
			});

			await cancelTestOrder(container, {
				orderId: order.id,
				telegramChatId: buyerChatId,
			});

			const { bot, editedMessages } = createTestBot();

			await bot.handleUpdate(
				makeCallbackQueryUpdate(
					161,
					buyerChatId,
					`account:order:${order.id}`,
					1,
					"Canc",
					"canc_detail_user",
				),
			);

			expect(editedMessages).toHaveLength(1);
			const text = editedMessages[0].text;
			expect(text).toContain("لغو شده");

			const flatButtons = editedMessages[0].reply_markup.inline_keyboard.flat() as any[];
			expect(flatButtons.some((b) => b.callback_data.startsWith("order:cancel:"))).toBe(false);
			expect(flatButtons.some((b) => b.callback_data === ACCOUNT_CALLBACKS.ORDERS)).toBe(true);
		});

		it("[🔙 بازگشت به لیست] navigates back to the order history list view", async () => {
			const { buyer, wallet } = await createTestBuyer(container, {
				telegramChatId: buyerChatId,
				telegramUsername: "nav_back_user",
			});

			await db.update(wallets).set({ availableBalance: "100.00" }).where(eq(wallets.id, wallet.id));

			const item = await createTestCatalogItem(container, {
				name: "Nav Test Item",
				usdPrice: "10.00",
				isActive: true,
			});

			await placeTestOrder(container, {
				userId: buyer.id,
				catalogItemId: item.id,
			});

			const { bot, editedMessages } = createTestBot();

			// User taps [🔙 بازگشت به لیست]
			await bot.handleUpdate(
				makeCallbackQueryUpdate(
					17,
					buyerChatId,
					ACCOUNT_CALLBACKS.ORDERS,
					1,
					"NavBack",
					"nav_back_user",
				),
			);

			expect(editedMessages).toHaveLength(1);
			expect(editedMessages[0].text).toContain("تاریخچه سفارش");
			const flatButtons = editedMessages[0].reply_markup.inline_keyboard.flat() as any[];
			expect(flatButtons.some((b) => b.callback_data.startsWith(ACCOUNT_CALLBACKS.ORDER_PREFIX))).toBe(true);
		});

		it("Cancel-from-detail flow triggers existing order:cancel callback and confirms refund", async () => {
			const { buyer, wallet } = await createTestBuyer(container, {
				telegramChatId: buyerChatId,
				telegramUsername: "cancel_detail_user",
			});

			await db.update(wallets).set({ availableBalance: "100.00" }).where(eq(wallets.id, wallet.id));

			const item = await createTestCatalogItem(container, {
				name: "Order To Cancel",
				usdPrice: "30.00",
				isActive: true,
			});

			const { order } = await placeTestOrder(container, {
				userId: buyer.id,
				catalogItemId: item.id,
			});

			// Balance after placement: 70.00
			const [wAfter] = await db.select().from(wallets).where(eq(wallets.id, wallet.id));
			expect(wAfter?.availableBalance).toBe("70.00");

			const { bot, editedMessages, answeredCallbackQueries } = createTestBot();

			// Buyer taps [❌ لغو سفارش] from detail view
			await bot.handleUpdate(
				makeCallbackQueryUpdate(
					18,
					buyerChatId,
					`order:cancel:${order.id}`,
					1,
					"CancelUser",
					"cancel_detail_user",
				),
			);

			expect(answeredCallbackQueries).toHaveLength(1);
			expect(answeredCallbackQueries[0].text).toContain("لغو شد");

			// Assertion: message edited with refund confirmation
			const confirmation = editedMessages.find((m) => Number(m.chat_id) === buyerChatId);
			expect(confirmation).toBeDefined();
			expect(confirmation?.text).toContain("با موفقیت لغو شد");
			expect(confirmation?.text).toContain("$30.00");
			expect(confirmation?.text).toContain("$100.00");

			// DB assertion: Order is CANCELLED and balance is restored to 100.00
			const [dbOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
			expect(dbOrder?.status).toBe("CANCELLED");

			const [wRestored] = await db.select().from(wallets).where(eq(wallets.id, wallet.id));
			expect(wRestored?.availableBalance).toBe("100.00");
		});

		it("alerts buyer when attempting to view an order belonging to another buyer", async () => {
			const { buyer: owner, wallet: ownerWallet } = await createTestBuyer(container, {
				telegramChatId: buyerChatId,
				telegramUsername: "owner_user",
			});
			const otherChatId = 999222333;
			await createTestBuyer(container, {
				telegramChatId: otherChatId,
				telegramUsername: "other_user",
			});

			await db.update(wallets).set({ availableBalance: "100.00" }).where(eq(wallets.id, ownerWallet.id));

			const item = await createTestCatalogItem(container, {
				name: "Private Item",
				usdPrice: "10.00",
				isActive: true,
			});

			const { order } = await placeTestOrder(container, {
				userId: owner.id,
				catalogItemId: item.id,
			});

			const { bot, answeredCallbackQueries } = createTestBot();

			// Other buyer attempts to drill into owner's order
			await bot.handleUpdate(
				makeCallbackQueryUpdate(
					19,
					otherChatId,
					`account:order:${order.id}`,
					1,
					"Other",
					"other_user",
				),
			);

			expect(answeredCallbackQueries).toHaveLength(1);
			expect(answeredCallbackQueries[0].show_alert).toBe(true);
			expect(answeredCallbackQueries[0].text).toContain("سفارش مورد نظر یافت نشد");
		});

		it("alerts buyer when attempting to view a non-existent order or invalid UUID", async () => {
			await createTestBuyer(container, {
				telegramChatId: buyerChatId,
				telegramUsername: "invalid_order_user",
			});

			const { bot, answeredCallbackQueries } = createTestBot();

			// Non-existent UUID
			await bot.handleUpdate(
				makeCallbackQueryUpdate(
					20,
					buyerChatId,
					"account:order:00000000-0000-0000-0000-000000000000",
					1,
					"User",
					"invalid_order_user",
				),
			);

			expect(answeredCallbackQueries).toHaveLength(1);
			expect(answeredCallbackQueries[0].show_alert).toBe(true);
			expect(answeredCallbackQueries[0].text).toContain("سفارش مورد نظر یافت نشد");

			// Invalid UUID format
			await bot.handleUpdate(
				makeCallbackQueryUpdate(
					21,
					buyerChatId,
					"account:order:not-a-valid-uuid",
					1,
					"User",
					"invalid_order_user",
				),
			);

			expect(answeredCallbackQueries).toHaveLength(2);
			expect(answeredCallbackQueries[1].show_alert).toBe(true);
			expect(answeredCallbackQueries[1].text).toContain("سفارش مورد نظر یافت نشد");
		});

		it("account:profile callback edits message back to Profile Card", async () => {
			await createTestBuyer(container, {
				telegramChatId: buyerChatId,
				telegramUsername: "profile_back_user",
			});

			const { bot, editedMessages, answeredCallbackQueries } = createTestBot();

			await bot.handleUpdate(
				makeCallbackQueryUpdate(
					22,
					buyerChatId,
					ACCOUNT_CALLBACKS.PROFILE,
					1,
					"User",
					"profile_back_user",
				),
			);

			expect(answeredCallbackQueries).toHaveLength(1);
			expect(editedMessages).toHaveLength(1);
			expect(editedMessages[0].text).toContain("حساب کاربری");
			expect(editedMessages[0].text).toContain("profile\\_back\\_user");
		});
	});

	describe("Integration: Transaction History Bot Routing (Ticket 05)", () => {
		it("renders empty state message when buyer has no transactions", async () => {
			await createTestBuyer(container, {
				telegramChatId: buyerChatId,
				telegramUsername: "empty_tx_user",
			});

			const { bot, editedMessages, answeredCallbackQueries } = createTestBot();

			await bot.handleUpdate(
				makeCallbackQueryUpdate(
					30,
					buyerChatId,
					ACCOUNT_CALLBACKS.TRANSACTIONS,
					1,
					"Empty",
					"empty_tx_user",
				),
			);

			expect(answeredCallbackQueries).toHaveLength(1);
			expect(editedMessages).toHaveLength(1);
			expect(editedMessages[0].text).toContain("تاریخچه تراکنش‌ها");
			expect(editedMessages[0].text).toContain("شما تاکنون هیچ تراکنشی نداشته‌اید");

			const flatButtons = editedMessages[0].reply_markup.inline_keyboard.flat();
			expect(flatButtons).toHaveLength(1);
			expect(flatButtons[0].callback_data).toBe(ACCOUNT_CALLBACKS.PROFILE);
			expect(flatButtons[0].text).toContain("بازگشت به پروفایل");
		});

		it("renders recent transactions in descending order with credit and debit indicators", async () => {
			const { buyer, wallet } = await createTestBuyer(container, {
				telegramChatId: buyerChatId,
				telegramUsername: "tx_history_user",
			});

			const ledgerRepo = container.resolve<ILedgerRepository<any>>(TOKENS.LedgerRepository);

			// 1. Credit: Top-up $50
			const [topUp] = await db
				.insert(topUpRequests)
				.values({
					userId: buyer.id,
					lockedIrrPerUsd: 600000n,
					rateSource: "MANUAL",
					usdAmount: "50.00",
					irrAmount: 30000000n,
					status: "APPROVED",
					expiresAt: new Date(Date.now() + 3600000),
				})
				.returning();

			await ledgerRepo.createTransactionWithEntries(
				{
					topUpRequestId: topUp!.id,
					narrative: "شارژ کیف پول",
					entries: [
						{ accountType: "SYSTEM_CASH", direction: "DEBIT", usdAmount: "50.00", walletId: null },
						{ accountType: "BUYER_WALLET", direction: "CREDIT", usdAmount: "50.00", walletId: wallet.id },
					],
				},
				db,
			);

			// 2. Debit: Service purchase $15
			const item = await createTestCatalogItem(container, {
				name: "اکانت پرمیوم",
				usdPrice: "15.00",
				isActive: true,
			});
			const [order] = await db
				.insert(orders)
				.values({
					userId: buyer.id,
					catalogItemId: item.id,
					usdPriceSnapshot: "15.00",
					status: "PLACED",
				})
				.returning();

			await ledgerRepo.createTransactionWithEntries(
				{
					orderId: order!.id,
					narrative: "خرید اکانت پرمیوم",
					entries: [
						{ accountType: "BUYER_WALLET", direction: "DEBIT", usdAmount: "15.00", walletId: wallet.id },
						{ accountType: "SYSTEM_CASH", direction: "CREDIT", usdAmount: "15.00", walletId: null },
					],
				},
				db,
			);

			const { bot, editedMessages, answeredCallbackQueries } = createTestBot();

			await bot.handleUpdate(
				makeCallbackQueryUpdate(
					31,
					buyerChatId,
					ACCOUNT_CALLBACKS.TRANSACTIONS,
					1,
					"TxUser",
					"tx_history_user",
				),
			);

			expect(answeredCallbackQueries).toHaveLength(1);
			expect(editedMessages).toHaveLength(1);
			const text = editedMessages[0].text;
			expect(text).toContain("تاریخچه تراکنش‌های شما");
			expect(text).toContain("➖ خرید اکانت پرمیوم: -$15.00");
			expect(text).toContain("➕ شارژ کیف پول: +$50.00");

			// Most recent (debit) appears before older (credit) in the text
			const debitIdx = text.indexOf("خرید اکانت پرمیوم");
			const creditIdx = text.indexOf("شارژ کیف پول");
			expect(debitIdx).toBeLessThan(creditIdx);

			const flatButtons = editedMessages[0].reply_markup.inline_keyboard.flat();
			expect(flatButtons).toHaveLength(1);
			expect(flatButtons[0].callback_data).toBe(ACCOUNT_CALLBACKS.PROFILE);
		});

		it("shows only up to 5 most recent transactions when buyer has more", async () => {
			const { buyer, wallet } = await createTestBuyer(container, {
				telegramChatId: buyerChatId,
				telegramUsername: "many_tx_user",
			});

			const ledgerRepo = container.resolve<ILedgerRepository<any>>(TOKENS.LedgerRepository);

			// Insert 7 transactions
			for (let i = 1; i <= 7; i++) {
				const [req] = await db
					.insert(topUpRequests)
					.values({
						userId: buyer.id,
						lockedIrrPerUsd: 600000n,
						rateSource: "MANUAL",
						usdAmount: `${i * 10}.00`,
						irrAmount: BigInt(i * 10 * 600000),
						status: "APPROVED",
						expiresAt: new Date(Date.now() + 3600000),
					})
					.returning();

				await ledgerRepo.createTransactionWithEntries(
					{
						topUpRequestId: req!.id,
						narrative: `تراکنش ${i}`,
						entries: [
							{ accountType: "SYSTEM_CASH", direction: "DEBIT", usdAmount: `${i * 10}.00`, walletId: null },
							{ accountType: "BUYER_WALLET", direction: "CREDIT", usdAmount: `${i * 10}.00`, walletId: wallet.id },
						],
					},
					db,
				);
			}

			const { bot, editedMessages } = createTestBot();

			await bot.handleUpdate(
				makeCallbackQueryUpdate(
					32,
					buyerChatId,
					ACCOUNT_CALLBACKS.TRANSACTIONS,
					1,
					"ManyTx",
					"many_tx_user",
				),
			);

			expect(editedMessages).toHaveLength(1);
			const text = editedMessages[0].text;
			// Descending order: 7, 6, 5, 4, 3 should be present; 2 and 1 should not
			expect(text).toContain("تراکنش 7");
			expect(text).toContain("تراکنش 6");
			expect(text).toContain("تراکنش 5");
			expect(text).toContain("تراکنش 4");
			expect(text).toContain("تراکنش 3");
			expect(text).not.toContain("تراکنش 2");
			expect(text).not.toContain("تراکنش 1");
		});

		it("re-renders Profile Card when [🔙 بازگشت به پروفایل] is tapped from transaction history", async () => {
			await createTestBuyer(container, {
				telegramChatId: buyerChatId,
				telegramUsername: "back_from_tx_user",
			});

			const { bot, editedMessages, answeredCallbackQueries } = createTestBot();

			// First open transaction history
			await bot.handleUpdate(
				makeCallbackQueryUpdate(
					33,
					buyerChatId,
					ACCOUNT_CALLBACKS.TRANSACTIONS,
					1,
					"BackUser",
					"back_from_tx_user",
				),
			);

			expect(editedMessages).toHaveLength(1);
			expect(editedMessages[0].text).toContain("تاریخچه تراکنش‌ها");

			// Then tap back button
			await bot.handleUpdate(
				makeCallbackQueryUpdate(
					34,
					buyerChatId,
					ACCOUNT_CALLBACKS.PROFILE,
					1,
					"BackUser",
					"back_from_tx_user",
				),
			);

			expect(answeredCallbackQueries).toHaveLength(2);
			expect(editedMessages).toHaveLength(2);
			expect(editedMessages[1].text).toContain("حساب کاربری");
			expect(editedMessages[1].text).toContain("back\\_from\\_tx\\_user");
		});

		it("alerts buyer when an unregistered user triggers account:transactions", async () => {
			const { bot, answeredCallbackQueries, editedMessages } = createTestBot();

			await bot.handleUpdate(
				makeCallbackQueryUpdate(
					35,
					999888777,
					ACCOUNT_CALLBACKS.TRANSACTIONS,
					1,
					"Unknown",
					"unknown_user",
				),
			);

			expect(answeredCallbackQueries).toHaveLength(1);
			expect(answeredCallbackQueries[0].show_alert).toBe(true);
			expect(answeredCallbackQueries[0].text).toContain("کاربر یافت نشد");
			expect(editedMessages).toHaveLength(0);
		});
	});
});
