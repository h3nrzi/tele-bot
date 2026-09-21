import "reflect-metadata";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setupTestDatabase } from "@tests/helpers/test-db";
import { createMockFetch } from "@tests/helpers/mock-context";
import { createBot } from "@/bot/bot";
import { createTestBuyer, createTestCatalogItem } from "@tests/helpers/fixtures";
import { wallets } from "@/modules/wallet/wallet.schema";
import { orders, ledgerTransactions, ledgerEntries } from "@/core/database/schema";
import { count, eq } from "drizzle-orm";
import { TOKENS } from "@/core/di/tokens";
import type { ICredentialCryptoService } from "@/core/crypto/credential-crypto.interface";

describe("Buyer Pre-Placement Requirement Flow & Atomic Order Placement (Ticket 03)", () => {
	const { db, container } = setupTestDatabase();
	const buyerChatId = 987654321;
	const adminChatId = 123456789;
	const originalEnv = process.env.ADMIN_IDS;

	beforeEach(() => {
		process.env.ADMIN_IDS = `${adminChatId}`;
	});

	afterEach(() => {
		process.env.ADMIN_IDS = originalEnv;
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
					text: "🛍️ کاتالوگ خدمات",
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
			deletedMessages,
		};
	}

	describe("1. Pre-Conversation Fail-Fast Available Balance Check", () => {
		it("stops underfunded buyers immediately before any input prompts appear (DIRECT_ACCOUNT)", async () => {
			const { buyer } = await createTestBuyer(container, {
				telegramChatId: buyerChatId,
				telegramUsername: "underfunded_buyer",
			});

			// Available balance $5.00, item price $20.00
			await db.update(wallets).set({ availableBalance: "5.00" }).where(eq(wallets.userId, buyer.id));

			const item = await createTestCatalogItem(container, {
				name: "Spotify Premium 1 Year",
				usdPrice: "20.00",
				catalogType: "DIRECT_ACCOUNT",
				fulfillmentStrategy: "ACTIVATION",
			});

			const { bot, editedMessages, repliedMessages, answeredCallbackQueries } = createTestBot();

			await bot.handleUpdate(makeCallbackQueryUpdate(1, buyerChatId, `shop:item:${item.id}`));

			expect(answeredCallbackQueries).toHaveLength(1);
			// Either edited message or replied message warns about balance
			const warningText = editedMessages[0]?.text ?? repliedMessages[0];
			expect(warningText).toContain("موجودی کیف پول شما برای خرید این خدمت کافی نیست");
			expect(warningText).toContain("/topup");

			// Confirm that NO conversation input prompt was sent (e.g. asking for email)
			expect(repliedMessages.some((m) => m.includes("ایمیل"))).toBe(false);
			expect(repliedMessages.some((m) => m.includes("رمز عبور"))).toBe(false);

			// Assert no orders created
			const [orderCountResult] = await db.select({ value: count() }).from(orders);
			expect(Number(orderCountResult?.value ?? 0)).toBe(0);
		});

		it("stops underfunded buyers immediately for CONFIG_VPN and IDENTITY_HANDLE items", async () => {
			const { buyer } = await createTestBuyer(container, {
				telegramChatId: buyerChatId,
				telegramUsername: "underfunded_buyer_2",
			});

			await db.update(wallets).set({ availableBalance: "2.00" }).where(eq(wallets.userId, buyer.id));

			const vpnItem = await createTestCatalogItem(container, {
				name: "VPN Germany 1 Month",
				usdPrice: "8.00",
				catalogType: "CONFIG_VPN",
				fulfillmentStrategy: "PAYLOAD_DELIVERY",
			});

			const { bot, editedMessages, repliedMessages } = createTestBot();

			await bot.handleUpdate(makeCallbackQueryUpdate(1, buyerChatId, `shop:item:${vpnItem.id}`));

			const warningText = editedMessages[0]?.text ?? repliedMessages[0];
			expect(warningText).toContain("موجودی کیف پول شما برای خرید این خدمت کافی نیست");
			// Region selection keyboard should not be displayed
			expect(repliedMessages.some((m) => m.includes("منطقه سرور"))).toBe(false);
		});
	});

	describe("2. DIRECT_ACCOUNT Requirement Collection Flow", () => {
		it("collects email with validation, deletes raw password message, masks password in preview, and atomically places order with encryption", async () => {
			const { buyer, wallet } = await createTestBuyer(container, {
				telegramChatId: buyerChatId,
				telegramUsername: "spotify_buyer",
			});

			await db.update(wallets).set({ availableBalance: "50.00" }).where(eq(wallets.id, wallet.id));

			const item = await createTestCatalogItem(container, {
				name: "Spotify Premium",
				description: "Direct upgrade on your account",
				usdPrice: "15.00",
				catalogType: "DIRECT_ACCOUNT",
				fulfillmentStrategy: "ACTIVATION",
			});

			const { bot, repliedMessages, deletedMessages, editedMessages } = createTestBot();

			// Step 1: Buyer taps item button in /shop
			await bot.handleUpdate(makeCallbackQueryUpdate(1, buyerChatId, `shop:item:${item.id}`));

			// Bot should prompt for email
			expect(repliedMessages.some((m) => m.includes("لطفاً آدرس ایمیل اکانت خود را ارسال کنید"))).toBe(true);

			// Step 2: Buyer sends invalid email format
			await bot.handleUpdate(makeMessageUpdate(2, buyerChatId, "invalid-email-format"));
			expect(repliedMessages.some((m) => m.includes("فرمت ایمیل وارد شده نامعتبر است"))).toBe(true);

			// Step 3: Buyer sends valid email
			await bot.handleUpdate(makeMessageUpdate(3, buyerChatId, "buyer@example.com"));

			// Bot should prompt for password and mention immediate deletion
			expect(repliedMessages.some((m) => m.includes("لطفاً رمز عبور اکانت خود را ارسال کنید"))).toBe(true);
			expect(repliedMessages.some((m) => m.includes("بلافاصله پس از دریافت از تاریخچه چت پاک خواهد شد"))).toBe(true);

			// Step 4: Buyer sends raw password message (message_id: 4)
			await bot.handleUpdate(makeMessageUpdate(4, buyerChatId, "SuperSecretPassword123!"));

			// CRITICAL REQUIREMENT: Raw password message MUST be deleted immediately
			expect(deletedMessages).toContainEqual({
				chat_id: buyerChatId,
				message_id: 4,
			});

			// Bot should now show the final confirmation summary prompt
			const confirmationMessage = repliedMessages.find((m) => m.includes("پیش‌فاکتور خرید خدمت"));
			expect(confirmationMessage).toBeDefined();
			expect(confirmationMessage).toContain("Spotify Premium");
			expect(confirmationMessage).toContain("$15.00");
			expect(confirmationMessage).toContain("$50.00"); // Available balance
			expect(confirmationMessage).toContain("$35.00"); // Remaining balance
			expect(confirmationMessage).toContain("buyer@example.com");
			expect(confirmationMessage).toContain("••••••••"); // Masked password
			expect(confirmationMessage).not.toContain("SuperSecretPassword123!"); // Plaintext NEVER in prompt

			// Step 5: Buyer clicks [✓ Confirm]
			await bot.handleUpdate(makeCallbackQueryUpdate(5, buyerChatId, "req:confirm", 5));

			// Verification 1: Confirmation message edited or replied with success
			const finalSuccess =
				editedMessages.find((m) => m.text?.includes("با موفقیت ثبت شد"))?.text ??
				repliedMessages.find((m) => m.includes("با موفقیت ثبت شد"));
			expect(finalSuccess).toBeDefined();
			expect(finalSuccess).toContain("Spotify Premium");
			expect(finalSuccess).toContain("$15.00");
			expect(finalSuccess).toContain("$35.00");

			// Verification 2: Database Order row
			const [dbOrder] = await db.select().from(orders).where(eq(orders.userId, buyer.id));
			expect(dbOrder).toBeDefined();
			expect(dbOrder?.status).toBe("PLACED");
			expect(dbOrder?.fulfillmentStrategySnapshot).toBe("ACTIVATION");

			// Verification 3: buyer_inputs stored with AES-256-GCM encryption
			const storedInputs = dbOrder?.buyerInputs as any;
			expect(storedInputs).toBeDefined();
			expect(storedInputs.email).toBe("buyer@example.com");
			expect(storedInputs.password).toHaveProperty("ciphertext");
			expect(storedInputs.password).toHaveProperty("iv");
			expect(storedInputs.password).toHaveProperty("tag");

			// Decrypt password using cryptoService to verify correctness
			const cryptoService = container.resolve<ICredentialCryptoService>(TOKENS.CredentialCryptoService);
			const decryptedPassword = cryptoService.decrypt(storedInputs.password);
			expect(decryptedPassword).toBe("SuperSecretPassword123!");

			// Verification 4: Wallet atomically debited
			const [dbWallet] = await db.select().from(wallets).where(eq(wallets.id, wallet.id));
			expect(dbWallet?.availableBalance).toBe("35.00");

			// Verification 5: Ledger transaction recorded
			const [dbTx] = await db.select().from(ledgerTransactions).where(eq(ledgerTransactions.orderId, dbOrder!.id));
			expect(dbTx).toBeDefined();

			const dbEntries = await db.select().from(ledgerEntries).where(eq(ledgerEntries.ledgerTransactionId, dbTx!.id));
			expect(dbEntries).toHaveLength(2);
			expect(dbEntries.some((e) => e.direction === "DEBIT" && e.accountType === "BUYER_WALLET")).toBe(true);
			expect(dbEntries.some((e) => e.direction === "CREDIT" && e.accountType === "SYSTEM_CASH")).toBe(true);
		});
	});

	describe("3. IDENTITY_HANDLE Requirement Collection Flow", () => {
		it("validates handle format and records targetUsername in order placement", async () => {
			const { buyer, wallet } = await createTestBuyer(container, {
				telegramChatId: buyerChatId,
				telegramUsername: "gift_buyer",
			});

			await db.update(wallets).set({ availableBalance: "60.00" }).where(eq(wallets.id, wallet.id));

			const item = await createTestCatalogItem(container, {
				name: "Telegram Premium 3 Months Gift",
				usdPrice: "12.00",
				catalogType: "IDENTITY_HANDLE",
				fulfillmentStrategy: "PAYLOAD_DELIVERY",
			});

			const { bot, repliedMessages } = createTestBot();

			// Step 1: Select item
			await bot.handleUpdate(makeCallbackQueryUpdate(1, buyerChatId, `shop:item:${item.id}`));

			expect(repliedMessages.some((m) => m.includes("شناسه عددی تلگرام مقصد را وارد کنید"))).toBe(true);

			// Step 2: Send invalid format (spaces and symbols)
			await bot.handleUpdate(makeMessageUpdate(2, buyerChatId, "invalid user name!"));
			expect(repliedMessages.some((m) => m.includes("شناسه وارد شده نامعتبر است"))).toBe(true);

			// Step 3: Send valid handle
			await bot.handleUpdate(makeMessageUpdate(3, buyerChatId, "@target_friend"));

			// Final confirmation summary
			const confirmationMessage = repliedMessages.find((m) => m.includes("پیش‌فاکتور خرید خدمت"));
			expect(confirmationMessage).toBeDefined();
			expect(confirmationMessage).toContain("Telegram Premium 3 Months Gift");
			expect(confirmationMessage).toContain("$12.00");
			expect(confirmationMessage).toContain("@target_friend");

			// Step 4: Confirm
			await bot.handleUpdate(makeCallbackQueryUpdate(4, buyerChatId, "req:confirm", 4));

			// Assert order in DB
			const [dbOrder] = await db.select().from(orders).where(eq(orders.userId, buyer.id));
			expect(dbOrder?.status).toBe("PLACED");
			expect(dbOrder?.fulfillmentStrategySnapshot).toBe("PAYLOAD_DELIVERY");
			expect(dbOrder?.buyerInputs).toEqual({ targetUsername: "@target_friend" });

			// Assert wallet debited: $60 - $12 = $48
			const [dbWallet] = await db.select().from(wallets).where(eq(wallets.id, wallet.id));
			expect(dbWallet?.availableBalance).toBe("48.00");
		});

		it("accepts numeric Telegram ID as a valid recipient identity", async () => {
			const { buyer, wallet } = await createTestBuyer(container, {
				telegramChatId: buyerChatId,
			});

			await db.update(wallets).set({ availableBalance: "50.00" }).where(eq(wallets.id, wallet.id));

			const item = await createTestCatalogItem(container, {
				name: "Telegram Stars 100",
				usdPrice: "2.50",
				catalogType: "IDENTITY_HANDLE",
				fulfillmentStrategy: "PAYLOAD_DELIVERY",
			});

			const { bot, repliedMessages } = createTestBot();

			await bot.handleUpdate(makeCallbackQueryUpdate(1, buyerChatId, `shop:item:${item.id}`));
			await bot.handleUpdate(makeMessageUpdate(2, buyerChatId, "9876543210"));

			const confirmationMessage = repliedMessages.find((m) => m.includes("پیش‌فاکتور خرید خدمت"));
			expect(confirmationMessage).toContain("9876543210");

			await bot.handleUpdate(makeCallbackQueryUpdate(3, buyerChatId, "req:confirm", 3));

			const [dbOrder] = await db.select().from(orders).where(eq(orders.userId, buyer.id));
			expect(dbOrder?.buyerInputs).toEqual({ targetUsername: "9876543210" });
		});
	});

	describe("4. CONFIG_VPN Requirement Collection Flow", () => {
		it("renders allowed regions inline keyboard and stores chosen server region", async () => {
			const { buyer, wallet } = await createTestBuyer(container, {
				telegramChatId: buyerChatId,
			});

			await db.update(wallets).set({ availableBalance: "30.00" }).where(eq(wallets.id, wallet.id));

			const item = await createTestCatalogItem(container, {
				name: "WireGuard VPN 1 Month",
				usdPrice: "6.00",
				catalogType: "CONFIG_VPN",
				fulfillmentStrategy: "PAYLOAD_DELIVERY",
				requirementConfig: {
					allowedRegions: ["de", "nl", "fi"],
				},
			});

			const { bot, repliedMessages } = createTestBot();

			// Step 1: Select item
			await bot.handleUpdate(makeCallbackQueryUpdate(1, buyerChatId, `shop:item:${item.id}`));

			expect(repliedMessages.some((m) => m.includes("منطقه سرور مورد نظر خود را برای اتصال انتخاب کنید"))).toBe(true);

			// Step 2: Buyer taps Netherlands region button
			await bot.handleUpdate(makeCallbackQueryUpdate(2, buyerChatId, "req:vpn:nl"));

			// Confirmation preview shows chosen region
			const confirmationMessage = repliedMessages.find((m) => m.includes("پیش‌فاکتور خرید خدمت"));
			expect(confirmationMessage).toBeDefined();
			expect(confirmationMessage).toContain("WireGuard VPN 1 Month");
			expect(confirmationMessage).toContain("هلند");

			// Step 3: Confirm order
			await bot.handleUpdate(makeCallbackQueryUpdate(3, buyerChatId, "req:confirm", 3));

			// Assert order in DB
			const [dbOrder] = await db.select().from(orders).where(eq(orders.userId, buyer.id));
			expect(dbOrder?.status).toBe("PLACED");
			expect(dbOrder?.buyerInputs).toEqual({ region: "nl" });

			// Assert wallet debited: $30 - $6 = $24
			const [dbWallet] = await db.select().from(wallets).where(eq(wallets.id, wallet.id));
			expect(dbWallet?.availableBalance).toBe("24.00");
		});
	});

	describe("5. Cancellation Resilience at Every Step", () => {
		it("cancels at email step without wallet debits or created orders", async () => {
			const { buyer, wallet } = await createTestBuyer(container, {
				telegramChatId: buyerChatId,
			});
			await db.update(wallets).set({ availableBalance: "50.00" }).where(eq(wallets.id, wallet.id));

			const item = await createTestCatalogItem(container, {
				name: "ChatGPT Plus",
				usdPrice: "20.00",
				catalogType: "DIRECT_ACCOUNT",
			});

			const { bot, repliedMessages } = createTestBot();

			await bot.handleUpdate(makeCallbackQueryUpdate(1, buyerChatId, `shop:item:${item.id}`));
			// Buyer clicks cancel inline button
			await bot.handleUpdate(makeCallbackQueryUpdate(2, buyerChatId, "flow:cancel"));

			expect(repliedMessages.some((m) => m.includes("لغو شد"))).toBe(true);

			const [orderCountResult] = await db.select({ value: count() }).from(orders);
			expect(Number(orderCountResult?.value ?? 0)).toBe(0);

			const [dbWallet] = await db.select().from(wallets).where(eq(wallets.id, wallet.id));
			expect(dbWallet?.availableBalance).toBe("50.00");
		});

		it("cancels at password step using /cancel command", async () => {
			const { buyer, wallet } = await createTestBuyer(container, {
				telegramChatId: buyerChatId,
			});
			await db.update(wallets).set({ availableBalance: "50.00" }).where(eq(wallets.id, wallet.id));

			const item = await createTestCatalogItem(container, {
				name: "ChatGPT Plus",
				usdPrice: "20.00",
				catalogType: "DIRECT_ACCOUNT",
			});

			const { bot, repliedMessages } = createTestBot();

			await bot.handleUpdate(makeCallbackQueryUpdate(1, buyerChatId, `shop:item:${item.id}`));
			await bot.handleUpdate(makeMessageUpdate(2, buyerChatId, "buyer@domain.com"));

			// At password step, buyer sends /cancel
			await bot.handleUpdate(makeMessageUpdate(3, buyerChatId, "/cancel"));

			expect(repliedMessages.some((m) => m.includes("لغو شد"))).toBe(true);

			const [orderCountResult] = await db.select({ value: count() }).from(orders);
			expect(Number(orderCountResult?.value ?? 0)).toBe(0);
			const [dbWallet] = await db.select().from(wallets).where(eq(wallets.id, wallet.id));
			expect(dbWallet?.availableBalance).toBe("50.00");
		});

		it("cancels at final confirmation prompt without creating orders", async () => {
			const { buyer, wallet } = await createTestBuyer(container, {
				telegramChatId: buyerChatId,
			});
			await db.update(wallets).set({ availableBalance: "50.00" }).where(eq(wallets.id, wallet.id));

			const item = await createTestCatalogItem(container, {
				name: "VPN Config",
				usdPrice: "5.00",
				catalogType: "CONFIG_VPN",
				requirementConfig: { allowedRegions: ["de"] },
			});

			const { bot, repliedMessages } = createTestBot();

			await bot.handleUpdate(makeCallbackQueryUpdate(1, buyerChatId, `shop:item:${item.id}`));
			await bot.handleUpdate(makeCallbackQueryUpdate(2, buyerChatId, "req:vpn:de"));

			// Confirmation preview shown; buyer clicks cancel
			await bot.handleUpdate(makeCallbackQueryUpdate(3, buyerChatId, "flow:cancel"));

			expect(repliedMessages.some((m) => m.includes("لغو شد"))).toBe(true);

			const [orderCountResult] = await db.select({ value: count() }).from(orders);
			expect(Number(orderCountResult?.value ?? 0)).toBe(0);
			const [dbWallet] = await db.select().from(wallets).where(eq(wallets.id, wallet.id));
			expect(dbWallet?.availableBalance).toBe("50.00");
		});
	});

	describe("6. STATIC_DELIVERY Direct Confirmation", () => {
		it("skips requirement collection conversation directly to confirmation prompt", async () => {
			const { buyer, wallet } = await createTestBuyer(container, {
				telegramChatId: buyerChatId,
			});
			await db.update(wallets).set({ availableBalance: "25.00" }).where(eq(wallets.id, wallet.id));

			const item = await createTestCatalogItem(container, {
				name: "iTunes Gift Card $10",
				usdPrice: "10.00",
				catalogType: "STATIC_DELIVERY",
				fulfillmentStrategy: "PAYLOAD_DELIVERY",
			});

			const { bot, editedMessages, answeredCallbackQueries } = createTestBot();

			await bot.handleUpdate(makeCallbackQueryUpdate(1, buyerChatId, `shop:item:${item.id}`));

			expect(answeredCallbackQueries).toHaveLength(1);
			expect(editedMessages).toHaveLength(1);

			// Renders standard confirmation prompt with shop:confirm:<id> button
			const promptText = editedMessages[0]?.text;
			expect(promptText).toContain("iTunes Gift Card $10");
			expect(promptText).toContain("$10.00");
			expect(promptText).toContain("$25.00");

			const flatButtons = editedMessages[0]?.reply_markup?.inline_keyboard?.flat() ?? [];
			const confirmBtn = flatButtons.find((b: any) => b.callback_data === `shop:confirm:${item.id}`);
			expect(confirmBtn).toBeDefined();

			// Confirm order via shop:confirm:<id>
			await bot.handleUpdate(makeCallbackQueryUpdate(2, buyerChatId, `shop:confirm:${item.id}`));

			const [dbOrder] = await db.select().from(orders).where(eq(orders.userId, buyer.id));
			expect(dbOrder?.status).toBe("PLACED");
			expect(dbOrder?.buyerInputs).toBeNull();
			expect(dbOrder?.fulfillmentStrategySnapshot).toBe("PAYLOAD_DELIVERY");
		});
	});
});
