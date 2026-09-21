import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setupTestDatabase } from "@tests/helpers/test-db";
import { createMockFetch } from "@tests/helpers/mock-context";
import { createBot } from "@/bot/bot";
import { createTestBuyer, createTestCatalogItem } from "@tests/helpers/fixtures";
import { orders, orderAdminNotifications } from "@/modules/order/order.schema";
import { wallets } from "@/modules/wallet/wallet.schema";
import { eq } from "drizzle-orm";
import { TOKENS } from "@/core/di/tokens";
import type { ICredentialCryptoService } from "@/core/crypto/credential-crypto.interface";
import { OrderService } from "@/modules/order/order.service";

describe("Claim-Gated Admin Notifications & Decrypted Credential Reveal (Ticket 04 / ADR-0013)", () => {
	const { db, container } = setupTestDatabase();
	const adminChatId1 = 111222333;
	const adminChatId2 = 444555666;
	const buyerChatId = 987654321;
	const originalEnv = { ...process.env };

	beforeEach(() => {
		process.env.ADMIN_IDS = `${adminChatId1},${adminChatId2}`;
		process.env.CREDENTIALS_ENCRYPTION_KEY =
			"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
	});

	afterEach(() => {
		process.env = { ...originalEnv };
	});

	function makeCallbackQueryUpdate(
		updateId: number,
		chatId: number,
		data: string,
		messageId = 10,
		username = "admin_one",
	) {
		return {
			update_id: updateId,
			callback_query: {
				id: `cb_query_${updateId}`,
				from: {
					id: chatId,
					is_bot: false,
					first_name: "Admin",
					username,
				},
				message: {
					message_id: messageId,
					date: Math.floor(Date.now() / 1000),
					chat: { id: chatId, type: "private" },
					text: "📦 سفارش جدید ثبت شد",
				},
				data,
			},
		} as any;
	}

	function makeMessageUpdate(
		updateId: number,
		chatId: number,
		text: string,
		messageId = 1,
		username = "testbuyer",
	) {
		return {
			update_id: updateId,
			message: {
				message_id: messageId,
				date: Math.floor(Date.now() / 1000),
				chat: { id: chatId, type: "private" },
				from: {
					id: chatId,
					is_bot: false,
					first_name: "Buyer",
					username,
				},
				text,
			},
		} as any;
	}

	function createTestBot() {
		const repliedMessages: string[] = [];
		const editedMessages: any[] = [];
		const answeredCallbackQueries: any[] = [];
		const sentMessages: any[] = [];
		const deletedMessages: any[] = [];

		const { fetch: mockFetch } = createMockFetch(
			repliedMessages,
			[],
			editedMessages,
			answeredCallbackQueries,
			sentMessages,
			deletedMessages,
		);

		const bot = createBot({
			token: "test_token",
			container,
			dbClient: db,
			adminIds: `${adminChatId1},${adminChatId2}`,
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
			deletedMessages,
		};
	}

	it("broadcasts notifications with masked passwords to all admins, then reveals decrypted credentials exclusively to claiming admin", async () => {
		const { buyer, wallet } = await createTestBuyer(container, {
			telegramChatId: buyerChatId,
			telegramUsername: "buyer_direct",
		});

		await db.update(wallets).set({ availableBalance: "100.00" }).where(eq(wallets.id, wallet.id));

		const item = await createTestCatalogItem(container, {
			name: "Spotify Premium 1M",
			usdPrice: "15.00",
			isActive: true,
			catalogType: "DIRECT_ACCOUNT",
			fulfillmentStrategy: "ACTIVATION",
		});

		const { bot, sentMessages, editedMessages } = createTestBot();

		const cryptoService = container.resolve<ICredentialCryptoService>(TOKENS.CredentialCryptoService);
		const rawPassword = "SuperSecretPassword123!";
		const encryptedPassword = cryptoService.encrypt(rawPassword);

		// Place order via orderService (simulating the completed buyer confirmation step)
		const orderService = container.resolve(OrderService);
		const placeResult = await orderService.placeOrder({
			userId: buyer.id,
			catalogItemId: item.id,
			buyerInputs: {
				email: "spotify_fan@domain.com",
				password: encryptedPassword,
			},
		});

		expect(placeResult.order.status).toBe("PLACED");

		// 1. Verify broadcast push notification to both Admin 1 and Admin 2
		const admin1Initial = sentMessages.find((m) => Number(m.chat_id) === adminChatId1);
		const admin2Initial = sentMessages.find((m) => Number(m.chat_id) === adminChatId2);

		expect(admin1Initial).toBeDefined();
		expect(admin2Initial).toBeDefined();

		// Both initial messages display email and MASKED password
		expect(admin1Initial.text).toContain("Spotify Premium 1M");
		expect(admin1Initial.text).toContain("📧 ایمیل: spotify_fan@domain.com");
		expect(admin1Initial.text).toContain("🔑 رمز عبور: 🔒 پس از شروع پردازش نمایش داده می‌شود");
		expect(admin1Initial.text).not.toContain(rawPassword);

		expect(admin2Initial.text).toContain("Spotify Premium 1M");
		expect(admin2Initial.text).toContain("📧 ایمیل: spotify_fan@domain.com");
		expect(admin2Initial.text).toContain("🔑 رمز عبور: 🔒 پس از شروع پردازش نمایش داده می‌شود");
		expect(admin2Initial.text).not.toContain(rawPassword);

		// 2. Admin 1 taps [▶ شروع پردازش] (Claim)
		const notifs = await db
			.select()
			.from(orderAdminNotifications)
			.where(eq(orderAdminNotifications.orderId, placeResult.order.id));
		expect(notifs).toHaveLength(2);

		const admin1Notif = notifs.find((n) => Number(n.adminTelegramId) === adminChatId1)!;
		const admin2Notif = notifs.find((n) => Number(n.adminTelegramId) === adminChatId2)!;

		await bot.handleUpdate(
			makeCallbackQueryUpdate(
				1,
				adminChatId1,
				`order:process:${placeResult.order.id}`,
				Number(admin1Notif.messageId),
				"lead_admin",
			),
		);

		// 3. Verify order status in DB is now PROCESSING
		const [dbOrder] = await db.select().from(orders).where(eq(orders.id, placeResult.order.id));
		expect(dbOrder?.status).toBe("PROCESSING");
		expect(dbOrder?.claimedByAdminTelegramId).toBe(BigInt(adminChatId1));

		// 4. Verify Admin 1's message was edited via editMessageText with decrypted credentials
		const admin1Edited = editedMessages.find(
			(m) => Number(m.chat_id) === adminChatId1 && m.message_id === Number(admin1Notif.messageId),
		);
		expect(admin1Edited).toBeDefined();
		expect(admin1Edited.text).toBeDefined();
		expect(admin1Edited.text).toContain("🔑 رمز عبور: SuperSecretPassword123!");
		expect(admin1Edited.text).toContain("📧 ایمیل: spotify_fan@domain.com");
		expect(admin1Edited.text).not.toContain("🔒 پس از شروع پردازش نمایش داده می‌شود");

		// Admin 1's reply markup shows claiming admin and action buttons
		const admin1Buttons = admin1Edited.reply_markup?.inline_keyboard?.flat() ?? [];
		expect(admin1Buttons.some((b: any) => b.text.includes("@lead_admin"))).toBe(true);
		expect(admin1Buttons.some((b: any) => b.callback_data === `order:fulfil:${placeResult.order.id}`)).toBe(true);

		// 5. Verify Admin 2's notification was NOT edited with credentials (text remains masked, only reply markup edited)
		const admin2Edited = editedMessages.find(
			(m) => Number(m.chat_id) === adminChatId2 && m.message_id === Number(admin2Notif.messageId),
		);
		expect(admin2Edited).toBeDefined();
		// Admin 2 edited message must NOT contain decrypted password
		expect(admin2Edited.text).toBeUndefined();
		const admin2Buttons = admin2Edited.reply_markup?.inline_keyboard?.flat() ?? [];
		expect(admin2Buttons.some((b: any) => b.text.includes("@lead_admin"))).toBe(true);
	});

	it("broadcasts notifications with non-sensitive config attributes for CONFIG_VPN", async () => {
		const { buyer, wallet } = await createTestBuyer(container, {
			telegramChatId: buyerChatId,
			telegramUsername: "vpn_buyer",
		});

		await db.update(wallets).set({ availableBalance: "50.00" }).where(eq(wallets.id, wallet.id));

		const item = await createTestCatalogItem(container, {
			name: "WireGuard VPN 1M",
			usdPrice: "5.00",
			isActive: true,
			catalogType: "CONFIG_VPN",
			fulfillmentStrategy: "PAYLOAD_DELIVERY",
		});

		const { bot, sentMessages, editedMessages } = createTestBot();

		const orderService = container.resolve(OrderService);
		const placeResult = await orderService.placeOrder({
			userId: buyer.id,
			catalogItemId: item.id,
			buyerInputs: {
				region: "nl",
			},
		});

		// 1. Verify broadcast contains VPN region
		const admin1Initial = sentMessages.find((m) => Number(m.chat_id) === adminChatId1);
		expect(admin1Initial).toBeDefined();
		expect(admin1Initial.text).toContain("🌐 منطقه سرور: 🇳🇱 هلند (nl)");

		// 2. Admin 2 claims
		await bot.handleUpdate(
			makeCallbackQueryUpdate(1, adminChatId2, `order:process:${placeResult.order.id}`, 200, "second_admin"),
		);

		// Because CONFIG_VPN has no credentials to reveal, both admins receive editMessageReplyMarkup
		expect(editedMessages).toHaveLength(2);
		expect(editedMessages.every((m) => m.text === undefined)).toBe(true);
	});

	it("order rejected before claim never reveals credentials to any admin", async () => {
		const { buyer, wallet } = await createTestBuyer(container, {
			telegramChatId: buyerChatId,
			telegramUsername: "reject_buyer",
		});

		await db.update(wallets).set({ availableBalance: "50.00" }).where(eq(wallets.id, wallet.id));

		const item = await createTestCatalogItem(container, {
			name: "Netflix Premium",
			usdPrice: "20.00",
			isActive: true,
			catalogType: "DIRECT_ACCOUNT",
			fulfillmentStrategy: "ACTIVATION",
		});

		const { bot, editedMessages } = createTestBot();

		const cryptoService = container.resolve<ICredentialCryptoService>(TOKENS.CredentialCryptoService);
		const rawPassword = "ConfidentialPassword999!";
		const encryptedPassword = cryptoService.encrypt(rawPassword);

		const orderService = container.resolve(OrderService);
		const placeResult = await orderService.placeOrder({
			userId: buyer.id,
			catalogItemId: item.id,
			buyerInputs: {
				email: "secret@netflix.com",
				password: encryptedPassword,
			},
		});

		// Reject directly before any claim
		await orderService.rejectOrder({
			orderId: placeResult.order.id,
			rejectionCategory: "OUT_OF_STOCK",
			rejectionNote: "Sold out",
			adminTelegramId: BigInt(adminChatId1),
			adminUsername: "admin1",
		});

		// Verify rejection edited reply markups but NEVER revealed plaintext password
		for (const edited of editedMessages) {
			if (edited.text) {
				expect(edited.text).not.toContain(rawPassword);
			}
		}
	});

	it("order cancelled before claim never reveals credentials to any admin", async () => {
		const { buyer, wallet } = await createTestBuyer(container, {
			telegramChatId: buyerChatId,
			telegramUsername: "cancel_buyer",
		});

		await db.update(wallets).set({ availableBalance: "50.00" }).where(eq(wallets.id, wallet.id));

		const item = await createTestCatalogItem(container, {
			name: "ChatGPT Plus 1M",
			usdPrice: "25.00",
			isActive: true,
			catalogType: "DIRECT_ACCOUNT",
			fulfillmentStrategy: "ACTIVATION",
		});

		const { bot, editedMessages } = createTestBot();

		const cryptoService = container.resolve<ICredentialCryptoService>(TOKENS.CredentialCryptoService);
		const rawPassword = "OpenAiSecretPassword888!";
		const encryptedPassword = cryptoService.encrypt(rawPassword);

		const orderService = container.resolve(OrderService);
		const placeResult = await orderService.placeOrder({
			userId: buyer.id,
			catalogItemId: item.id,
			buyerInputs: {
				email: "user@openai.com",
				password: encryptedPassword,
			},
		});

		// Cancel directly before any claim
		await orderService.cancelOrder({
			orderId: placeResult.order.id,
			userId: buyer.id,
		});

		// Verify cancellation edited reply markups but NEVER revealed plaintext password
		for (const edited of editedMessages) {
			if (edited.text) {
				expect(edited.text).not.toContain(rawPassword);
			}
		}
	});

	it("full interactive bot flow: buyer requirement prompt -> atomic order placement -> admin masked notification -> admin claim -> decrypted reveal", async () => {
		const { buyer, wallet } = await createTestBuyer(container, {
			telegramChatId: buyerChatId,
			telegramUsername: "interactive_buyer",
		});

		await db.update(wallets).set({ availableBalance: "50.00" }).where(eq(wallets.id, wallet.id));

		const item = await createTestCatalogItem(container, {
			name: "ChatGPT Plus",
			usdPrice: "20.00",
			isActive: true,
			catalogType: "DIRECT_ACCOUNT",
			fulfillmentStrategy: "ACTIVATION",
		});

		const { bot, sentMessages, editedMessages, deletedMessages } = createTestBot();

		// 1. Buyer taps catalog item in shop
		await bot.handleUpdate(makeCallbackQueryUpdate(1, buyerChatId, `shop:item:${item.id}`, 1, "interactive_buyer"));

		// 2. Buyer sends email
		await bot.handleUpdate(makeMessageUpdate(2, buyerChatId, "ai_buyer@example.com", 2, "interactive_buyer"));

		// 3. Buyer sends raw password (messageId: 3)
		await bot.handleUpdate(makeMessageUpdate(3, buyerChatId, "UltraSecretPassword456!", 3, "interactive_buyer"));

		// Raw password message deleted immediately from chat
		expect(deletedMessages).toContainEqual({
			chat_id: buyerChatId,
			message_id: 3,
		});

		// 4. Buyer confirms order
		await bot.handleUpdate(makeCallbackQueryUpdate(4, buyerChatId, "req:confirm", 4, "interactive_buyer"));

		// Order is placed in DB
		const [dbOrder] = await db.select().from(orders).where(eq(orders.userId, buyer.id));
		expect(dbOrder).toBeDefined();
		expect(dbOrder?.status).toBe("PLACED");

		// Initial admin broadcast has masked password
		const admin1Initial = sentMessages.find((m) => Number(m.chat_id) === adminChatId1);
		const admin2Initial = sentMessages.find((m) => Number(m.chat_id) === adminChatId2);
		expect(admin1Initial?.text).toContain("🔑 رمز عبور: 🔒 پس از شروع پردازش نمایش داده می‌شود");
		expect(admin1Initial?.text).not.toContain("UltraSecretPassword456!");
		expect(admin2Initial?.text).toContain("🔑 رمز عبور: 🔒 پس از شروع پردازش نمایش داده می‌شود");
		expect(admin2Initial?.text).not.toContain("UltraSecretPassword456!");

		// 5. Admin 2 taps [▶ شروع پردازش] (Admin 2 claims)
		const notifs = await db
			.select()
			.from(orderAdminNotifications)
			.where(eq(orderAdminNotifications.orderId, dbOrder!.id));
		const admin2Notif = notifs.find((n) => Number(n.adminTelegramId) === adminChatId2)!;
		const admin1Notif = notifs.find((n) => Number(n.adminTelegramId) === adminChatId1)!;

		await bot.handleUpdate(
			makeCallbackQueryUpdate(
				5,
				adminChatId2,
				`order:process:${dbOrder!.id}`,
				Number(admin2Notif.messageId),
				"lead_admin2",
			),
		);

		// Admin 2's message is edited to reveal the password
		const admin2Edited = editedMessages.find(
			(m) => Number(m.chat_id) === adminChatId2 && m.message_id === Number(admin2Notif.messageId),
		);
		expect(admin2Edited?.text).toContain("🔑 رمز عبور: UltraSecretPassword456!");
		expect(admin2Edited?.text).toContain("📧 ایمیل: ai_buyer@example.com");

		// Admin 1's message is NOT edited with credentials (text remains masked)
		const admin1Edited = editedMessages.find(
			(m) => Number(m.chat_id) === adminChatId1 && m.message_id === Number(admin1Notif.messageId),
		);
		expect(admin1Edited?.text).toBeUndefined();
		const admin1Buttons = admin1Edited?.reply_markup?.inline_keyboard?.flat() ?? [];
		expect(admin1Buttons.some((b: any) => b.text.includes("@lead_admin2"))).toBe(true);
	});
});
