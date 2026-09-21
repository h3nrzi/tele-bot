import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setupTestDatabase } from "@tests/helpers/test-db";
import { createMockFetch } from "@tests/helpers/mock-context";
import { createBot } from "@/bot/bot";
import { catalogItems } from "@/modules/catalog/catalog.schema";
import { createTestCatalogItem } from "@tests/helpers/fixtures";
import { isKeepCommand, isSkipCommand, isCancelCommand } from "@/bot/admin/conversations/catalog.conversation";
import { count, eq } from "drizzle-orm";

describe("/catalog Admin Command, Dashboard & Conversations", () => {
	const { db, container } = setupTestDatabase();
	const adminChatId = 123456789;
	const nonAdminChatId = 999888777;
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

	function makeCallbackQueryUpdate(
		updateId: number,
		chatId: number,
		data: string,
		messageId = 1,
		senderName = "Admin",
	) {
		return {
			update_id: updateId,
			callback_query: {
				id: `cb_${updateId}`,
				from: { id: chatId, is_bot: false, first_name: senderName },
				message: {
					message_id: messageId,
					date: Math.floor(Date.now() / 1000),
					chat: { id: chatId, type: "private", first_name: senderName },
					text: "📦 کاتالوگ خدمات",
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
		return { bot, repliedMessages, editedMessages, answeredCallbackQueries, sentMessages };
	}

	describe("Utility functions", () => {
		it("identifies keep commands correctly", () => {
			expect(isKeepCommand("/keep")).toBe(true);
			expect(isKeepCommand("keep")).toBe(true);
			expect(isKeepCommand("KEEP")).toBe(true);
			expect(isKeepCommand("حفظ")).toBe(true);
			expect(isKeepCommand("-")).toBe(true);
			expect(isKeepCommand("New Value")).toBe(false);
		});

		it("identifies skip commands correctly", () => {
			expect(isSkipCommand("/skip")).toBe(true);
			expect(isSkipCommand("skip")).toBe(true);
			expect(isSkipCommand("SKIP")).toBe(true);
			expect(isSkipCommand("-")).toBe(true);
			expect(isSkipCommand("Some note")).toBe(false);
		});

		it("identifies cancel commands correctly", () => {
			expect(isCancelCommand("/cancel")).toBe(true);
			expect(isCancelCommand("cancel")).toBe(true);
			expect(isCancelCommand("لغو")).toBe(true);
			expect(isCancelCommand("Valid Item")).toBe(false);
		});
	});

	describe("Access Control", () => {
		it("sends access-denied message when non-Admin executes /catalog", async () => {
			const { bot, repliedMessages } = createTestBot();

			await bot.handleUpdate(makeMessageUpdate(1, nonAdminChatId, "/catalog", "Buyer"));

			expect(repliedMessages).toHaveLength(1);
			expect(repliedMessages[0]).toContain("دسترسی غیرمجاز");
		});

		it("opens dashboard when Admin executes /catalog", async () => {
			const { bot, repliedMessages } = createTestBot();

			await bot.handleUpdate(makeMessageUpdate(1, adminChatId, "/catalog", "Admin"));

			expect(repliedMessages).toHaveLength(1);
			expect(repliedMessages[0]).toContain("کاتالوگ خدمات");
		});
	});

	describe("Dashboard View & Item Actions", () => {
		it("renders empty catalog dashboard message when no items exist", async () => {
			const { bot, repliedMessages } = createTestBot();

			await bot.handleUpdate(makeMessageUpdate(1, adminChatId, "/catalog", "Admin"));

			expect(repliedMessages).toHaveLength(1);
			expect(repliedMessages[0]).toContain("هیچ خدمتی در کاتالوگ ثبت نشده است");
		});

		it("renders catalog items as buttons with active/inactive indicators in dashboard", async () => {
			const item1 = await createTestCatalogItem(container, {
				name: "Telegram Premium 1 Month",
				description: "Instant activation",
				usdPrice: "4.99",
				isActive: true,
			});

			const item2 = await createTestCatalogItem(container, {
				name: "VPN 1 Year",
				description: "High speed VPN",
				usdPrice: "30.00",
				isActive: false,
			});

			const { bot, repliedMessages, sentMessages } = createTestBot();

			await bot.handleUpdate(makeMessageUpdate(1, adminChatId, "/catalog", "Admin"));

			expect(repliedMessages).toHaveLength(1);
			expect(repliedMessages[0]).toContain("کاتالوگ خدمات");

			const flatButtons = sentMessages[0]?.reply_markup?.inline_keyboard?.flat() ?? [];
			expect(flatButtons).toHaveLength(3); // item1, item2, and add new
			expect(flatButtons[0]?.text).toContain("Telegram Premium 1 Month");
			expect(flatButtons[0]?.text).toContain("$4.99");
			expect(flatButtons[0]?.text).toContain("🟢");
			expect(flatButtons[0]?.callback_data).toBe(`catalog:view:${item1.id}`);

			expect(flatButtons[1]?.text).toContain("VPN 1 Year");
			expect(flatButtons[1]?.text).toContain("$30.00");
			expect(flatButtons[1]?.text).toContain("🔴");
			expect(flatButtons[1]?.callback_data).toBe(`catalog:view:${item2.id}`);

			expect(flatButtons[2]?.callback_data).toBe("catalog:add");
		});

		it("opens item detail/action view when tapping a catalog item button (catalog:view:<id>)", async () => {
			const item = await createTestCatalogItem(container, {
				name: "Telegram Stars 500",
				description: "In-game and gift stars",
				usdPrice: "9.99",
				isActive: true,
			});

			const { bot, editedMessages } = createTestBot();

			await bot.handleUpdate(makeCallbackQueryUpdate(1, adminChatId, `catalog:view:${item.id}`));

			expect(editedMessages).toHaveLength(1);
			expect(editedMessages[0]?.text).toContain("جزئیات خدمت");
			expect(editedMessages[0]?.text).toContain("Telegram Stars 500");
			expect(editedMessages[0]?.text).toContain("$9.99");
			expect(editedMessages[0]?.text).toContain("In-game and gift stars");
			expect(editedMessages[0]?.text).toContain("🟢 فعال");

			const keyboard = editedMessages[0]?.reply_markup?.inline_keyboard;
			expect(keyboard).toHaveLength(2);
			// Row 1: [Edit] and [Deactivate]
			expect(keyboard[0][0]?.text).toContain("ویرایش");
			expect(keyboard[0][0]?.callback_data).toBe(`catalog:edit:${item.id}`);
			expect(keyboard[0][1]?.text).toContain("غیرفعال‌سازی");
			expect(keyboard[0][1]?.callback_data).toBe(`catalog:toggle:${item.id}`);
			// Row 2: [Back to list]
			expect(keyboard[1][0]?.text).toContain("بازگشت به لیست خدمات");
			expect(keyboard[1][0]?.callback_data).toBe("catalog:list");
		});

		it("returns to catalog dashboard list when clicking back button (catalog:list)", async () => {
			await createTestCatalogItem(container, {
				name: "Netflix 1 Month",
				usdPrice: "12.00",
			});

			const { bot, editedMessages } = createTestBot();

			await bot.handleUpdate(makeCallbackQueryUpdate(1, adminChatId, "catalog:list"));

			expect(editedMessages).toHaveLength(1);
			expect(editedMessages[0]?.text).toContain("کاتالوگ خدمات");

			const flatButtons = editedMessages[0]?.reply_markup?.inline_keyboard?.flat() ?? [];
			expect(flatButtons.some((btn: any) => btn.text.includes("Netflix 1 Month"))).toBe(true);
			expect(flatButtons.some((btn: any) => btn.callback_data === "catalog:add")).toBe(true);
		});

		it("toggles is_active from item detail view and refreshes the view immediately", async () => {
			const item = await createTestCatalogItem(container, {
				name: "Service Item",
				usdPrice: "10.00",
				isActive: true,
			});

			const { bot, editedMessages } = createTestBot();

			// Step 1: Deactivate
			await bot.handleUpdate(makeCallbackQueryUpdate(1, adminChatId, `catalog:toggle:${item.id}`));

			const [inDbAfterDeactivate] = await db.select().from(catalogItems).where(eq(catalogItems.id, item.id));

			expect(inDbAfterDeactivate?.isActive).toBe(false);
			expect(editedMessages.length).toBeGreaterThanOrEqual(1);
			expect(editedMessages[0]?.text).toContain("🔴 غیرفعال");
			expect(editedMessages[0]?.reply_markup?.inline_keyboard[0][1]?.text).toContain("فعال‌سازی");

			// Step 2: Reactivate
			await bot.handleUpdate(makeCallbackQueryUpdate(2, adminChatId, `catalog:toggle:${item.id}`));

			const [inDbAfterReactivate] = await db.select().from(catalogItems).where(eq(catalogItems.id, item.id));

			expect(inDbAfterReactivate?.isActive).toBe(true);
			expect(editedMessages.length).toBeGreaterThanOrEqual(2);
			expect(editedMessages[1]?.text).toContain("🟢 فعال");
			expect(editedMessages[1]?.reply_markup?.inline_keyboard[0][1]?.text).toContain("غیرفعال‌سازی");
		});
	});

	describe("Add Catalog Item Conversation ([+ Add New])", () => {
		it("walks Admin through complete add flow and creates item in DB", async () => {
			const { bot, repliedMessages } = createTestBot();

			// Step 1: Click [+ Add New]
			await bot.handleUpdate(makeCallbackQueryUpdate(1, adminChatId, "catalog:add"));

			expect(repliedMessages[0]).toContain("نام خدمت");

			// Step 2: Send Name
			await bot.handleUpdate(makeMessageUpdate(2, adminChatId, "Telegram Stars 500"));

			expect(repliedMessages[1]).toContain("توضیحات");

			// Step 3: Send Description
			await bot.handleUpdate(makeMessageUpdate(3, adminChatId, "500 in-app stars for gifts"));

			expect(repliedMessages[2]).toContain("نوع خدمت");

			// Step 4: Select Catalog Type (STATIC_DELIVERY)
			await bot.handleUpdate(makeCallbackQueryUpdate(4, adminChatId, "catalog:type:STATIC_DELIVERY"));

			expect(repliedMessages[3]).toContain("استراتژی");

			// Step 5: Confirm Suggested Strategy (PAYLOAD_DELIVERY)
			await bot.handleUpdate(makeCallbackQueryUpdate(5, adminChatId, "catalog:strategy:confirm_default"));

			expect(repliedMessages[4]).toContain("قیمت");

			// Step 6: Send Price
			await bot.handleUpdate(makeMessageUpdate(6, adminChatId, "9.99"));

			expect(repliedMessages[5]).toContain("تایید");
			expect(repliedMessages[5]).toContain("Telegram Stars 500");
			expect(repliedMessages[5]).toContain("$9.99");
			expect(repliedMessages[5]).toContain("تحویل محتوا / لایسنس");
			expect(repliedMessages[5]).toContain("تحویل متن / لایسنس");

			// Step 7: Confirm
			await bot.handleUpdate(makeMessageUpdate(7, adminChatId, "بله"));

			expect(repliedMessages[6]).toContain("با موفقیت ایجاد شد");

			const allItems = await db.select().from(catalogItems);
			expect(allItems).toHaveLength(1);
			expect(allItems[0]?.name).toBe("Telegram Stars 500");
			expect(allItems[0]?.description).toBe("500 in-app stars for gifts");
			expect(allItems[0]?.usdPrice).toBe("9.99");
			expect(allItems[0]?.isActive).toBe(true);
			expect(allItems[0]?.catalogType).toBe("STATIC_DELIVERY");
			expect(allItems[0]?.fulfillmentStrategy).toBe("PAYLOAD_DELIVERY");
			expect(allItems[0]?.requirementConfig).toBeNull();
		});

		it("allows skipping description with /skip in add flow", async () => {
			const { bot, repliedMessages } = createTestBot();

			await bot.handleUpdate(makeCallbackQueryUpdate(1, adminChatId, "catalog:add"));
			await bot.handleUpdate(makeMessageUpdate(2, adminChatId, "Gift Card 50"));
			await bot.handleUpdate(makeMessageUpdate(3, adminChatId, "/skip"));
			await bot.handleUpdate(makeCallbackQueryUpdate(4, adminChatId, "catalog:type:STATIC_DELIVERY"));
			await bot.handleUpdate(makeCallbackQueryUpdate(5, adminChatId, "catalog:strategy:confirm_default"));
			await bot.handleUpdate(makeMessageUpdate(6, adminChatId, "50.00"));
			await bot.handleUpdate(makeMessageUpdate(7, adminChatId, "yes"));

			expect(repliedMessages[6]).toContain("با موفقیت ایجاد شد");

			const allItems = await db.select().from(catalogItems);
			expect(allItems).toHaveLength(1);
			expect(allItems[0]?.name).toBe("Gift Card 50");
			expect(allItems[0]?.description).toBeNull();
			expect(allItems[0]?.usdPrice).toBe("50.00");
			expect(allItems[0]?.catalogType).toBe("STATIC_DELIVERY");
			expect(allItems[0]?.fulfillmentStrategy).toBe("PAYLOAD_DELIVERY");
		});

		it("re-prompts on invalid name or invalid price in add flow", async () => {
			const { bot, repliedMessages } = createTestBot();

			await bot.handleUpdate(makeCallbackQueryUpdate(1, adminChatId, "catalog:add"));
			expect(repliedMessages[0]).toContain("نام خدمت");

			// Invalid name (whitespace)
			await bot.handleUpdate(makeMessageUpdate(2, adminChatId, "   "));
			expect(repliedMessages[1]).toContain("نام خدمت");

			// Valid name
			await bot.handleUpdate(makeMessageUpdate(3, adminChatId, "Valid Name"));
			expect(repliedMessages[2]).toContain("توضیحات");

			// Skip description
			await bot.handleUpdate(makeMessageUpdate(4, adminChatId, "skip"));
			expect(repliedMessages[3]).toContain("نوع خدمت");

			// Valid catalog type
			await bot.handleUpdate(makeCallbackQueryUpdate(5, adminChatId, "catalog:type:STATIC_DELIVERY"));
			expect(repliedMessages[4]).toContain("استراتژی");

			// Confirm default strategy
			await bot.handleUpdate(makeCallbackQueryUpdate(6, adminChatId, "catalog:strategy:confirm_default"));
			expect(repliedMessages[5]).toContain("قیمت");

			// Invalid price (negative)
			await bot.handleUpdate(makeMessageUpdate(7, adminChatId, "-5"));
			expect(repliedMessages[6]).toContain("قیمت وارد شده نامعتبر است");

			// Valid price
			await bot.handleUpdate(makeMessageUpdate(8, adminChatId, "15.50"));
			expect(repliedMessages[7]).toContain("تایید");

			// Confirm
			await bot.handleUpdate(makeMessageUpdate(9, adminChatId, "تایید"));
			expect(repliedMessages[8]).toContain("با موفقیت ایجاد شد");
		});

		it("cancels add conversation when /cancel is sent", async () => {
			const { bot, repliedMessages } = createTestBot();

			await bot.handleUpdate(makeCallbackQueryUpdate(1, adminChatId, "catalog:add"));
			await bot.handleUpdate(makeMessageUpdate(2, adminChatId, "/cancel"));

			expect(repliedMessages[1]).toContain("لغو شد");

			const [countResult] = await db.select({ value: count() }).from(catalogItems);
			expect(Number(countResult?.value ?? 0)).toBe(0);
		});
	});

	describe("Polymorphic Catalog Item Creation Flow (Ticket 02)", () => {
		it("creates DIRECT_ACCOUNT item with auto-suggested ACTIVATION strategy", async () => {
			const { bot, repliedMessages } = createTestBot();

			// 1. Enter add flow
			await bot.handleUpdate(makeCallbackQueryUpdate(1, adminChatId, "catalog:add"));
			// 2. Name
			await bot.handleUpdate(makeMessageUpdate(2, adminChatId, "ChatGPT Plus 1 Month"));
			// 3. Description
			await bot.handleUpdate(makeMessageUpdate(3, adminChatId, "Requires buyer email and password"));
			// 4. Select DIRECT_ACCOUNT
			await bot.handleUpdate(makeCallbackQueryUpdate(4, adminChatId, "catalog:type:DIRECT_ACCOUNT"));

			// Verify strategy prompt auto-suggests ACTIVATION
			expect(repliedMessages[3]).toContain("استراتژی");
			expect(repliedMessages[3]).toContain("فعال‌سازی مستقیم");

			// 5. Confirm default strategy
			await bot.handleUpdate(makeCallbackQueryUpdate(5, adminChatId, "catalog:strategy:confirm_default"));
			// 6. Price
			await bot.handleUpdate(makeMessageUpdate(6, adminChatId, "20.00"));

			// 7. Preview check
			expect(repliedMessages[5]).toContain("پیش‌نمایش خدمت جدید");
			expect(repliedMessages[5]).toContain("ChatGPT Plus 1 Month");
			expect(repliedMessages[5]).toContain("ارتقای مستقیم اکانت");
			expect(repliedMessages[5]).toContain("فعال‌سازی مستقیم");
			expect(repliedMessages[5]).toContain("$20.00");

			// 8. Confirm
			await bot.handleUpdate(makeCallbackQueryUpdate(7, adminChatId, "flow:confirm"));

			expect(repliedMessages[6]).toContain("با موفقیت ایجاد شد");

			const [itemInDb] = await db.select().from(catalogItems);
			expect(itemInDb).toBeDefined();
			expect(itemInDb?.name).toBe("ChatGPT Plus 1 Month");
			expect(itemInDb?.catalogType).toBe("DIRECT_ACCOUNT");
			expect(itemInDb?.fulfillmentStrategy).toBe("ACTIVATION");
			expect(itemInDb?.requirementConfig).toBeNull();
			expect(itemInDb?.isActive).toBe(true);
		});

		it("creates IDENTITY_HANDLE item with auto-suggested ACTIVATION strategy", async () => {
			const { bot, repliedMessages } = createTestBot();

			await bot.handleUpdate(makeCallbackQueryUpdate(1, adminChatId, "catalog:add"));
			await bot.handleUpdate(makeMessageUpdate(2, adminChatId, "Telegram Premium 3 Months"));
			await bot.handleUpdate(makeMessageUpdate(3, adminChatId, "/skip"));
			await bot.handleUpdate(makeCallbackQueryUpdate(4, adminChatId, "catalog:type:IDENTITY_HANDLE"));

			// Auto-suggests ACTIVATION
			expect(repliedMessages[3]).toContain("فعال‌سازی مستقیم");

			await bot.handleUpdate(makeCallbackQueryUpdate(5, adminChatId, "catalog:strategy:confirm_default"));
			await bot.handleUpdate(makeMessageUpdate(6, adminChatId, "12.00"));
			await bot.handleUpdate(makeMessageUpdate(7, adminChatId, "yes"));

			expect(repliedMessages[6]).toContain("با موفقیت ایجاد شد");

			const [itemInDb] = await db.select().from(catalogItems);
			expect(itemInDb?.name).toBe("Telegram Premium 3 Months");
			expect(itemInDb?.catalogType).toBe("IDENTITY_HANDLE");
			expect(itemInDb?.fulfillmentStrategy).toBe("ACTIVATION");
			expect(itemInDb?.requirementConfig).toBeNull();
			expect(itemInDb?.isActive).toBe(true);
		});

		it("creates CONFIG_VPN item with server region preset selection", async () => {
			const { bot, repliedMessages, sentMessages } = createTestBot();

			await bot.handleUpdate(makeCallbackQueryUpdate(1, adminChatId, "catalog:add"));
			await bot.handleUpdate(makeMessageUpdate(2, adminChatId, "Fast VPN EU"));
			await bot.handleUpdate(makeMessageUpdate(3, adminChatId, "High speed server configs"));
			await bot.handleUpdate(makeCallbackQueryUpdate(4, adminChatId, "catalog:type:CONFIG_VPN"));

			// Auto-suggests PAYLOAD_DELIVERY
			expect(repliedMessages[3]).toContain("تحویل متن / لایسنس");

			await bot.handleUpdate(makeCallbackQueryUpdate(5, adminChatId, "catalog:strategy:confirm_default"));

			// Verify Region presets prompt is displayed
			expect(repliedMessages[4]).toContain("انتخاب مناطق سرور مجاز");

			// Select EU preset
			await bot.handleUpdate(makeCallbackQueryUpdate(6, adminChatId, "catalog:region:preset:eu"));

			// Price prompt
			expect(repliedMessages[5]).toContain("قیمت");
			await bot.handleUpdate(makeMessageUpdate(7, adminChatId, "5.99"));

			// Preview prompt
			expect(repliedMessages[6]).toContain("پیش‌نمایش خدمت جدید");
			expect(repliedMessages[6]).toContain("Fast VPN EU");
			expect(repliedMessages[6]).toContain("کانفیگ VPN");
			expect(repliedMessages[6]).toContain("تحویل متن / لایسنس");
			expect(repliedMessages[6]).toContain("de, nl, fi");
			expect(repliedMessages[6]).toContain("$5.99");

			// Confirm
			await bot.handleUpdate(makeCallbackQueryUpdate(8, adminChatId, "flow:confirm"));

			expect(repliedMessages[7]).toContain("با موفقیت ایجاد شد");

			const [itemInDb] = await db.select().from(catalogItems);
			expect(itemInDb?.name).toBe("Fast VPN EU");
			expect(itemInDb?.catalogType).toBe("CONFIG_VPN");
			expect(itemInDb?.fulfillmentStrategy).toBe("PAYLOAD_DELIVERY");
			expect(itemInDb?.requirementConfig).toEqual({ allowedRegions: ["de", "nl", "fi"] });
			expect(itemInDb?.isActive).toBe(true);
		});

		it("creates CONFIG_VPN item with custom typed server regions", async () => {
			const { bot, repliedMessages } = createTestBot();

			await bot.handleUpdate(makeCallbackQueryUpdate(1, adminChatId, "catalog:add"));
			await bot.handleUpdate(makeMessageUpdate(2, adminChatId, "Custom Region VPN"));
			await bot.handleUpdate(makeMessageUpdate(3, adminChatId, "/skip"));
			await bot.handleUpdate(makeCallbackQueryUpdate(4, adminChatId, "catalog:type:CONFIG_VPN"));
			await bot.handleUpdate(makeCallbackQueryUpdate(5, adminChatId, "catalog:strategy:confirm_default"));

			expect(repliedMessages[4]).toContain("انتخاب مناطق سرور مجاز");

			// Send custom comma-separated regions
			await bot.handleUpdate(makeMessageUpdate(6, adminChatId, "de, nl, us, fi"));

			await bot.handleUpdate(makeMessageUpdate(7, adminChatId, "7.50"));

			expect(repliedMessages[6]).toContain("مناطق سرور: de, nl, us, fi");

			await bot.handleUpdate(makeCallbackQueryUpdate(8, adminChatId, "flow:confirm"));

			expect(repliedMessages[7]).toContain("با موفقیت ایجاد شد");

			const [itemInDb] = await db.select().from(catalogItems);
			expect(itemInDb?.name).toBe("Custom Region VPN");
			expect(itemInDb?.catalogType).toBe("CONFIG_VPN");
			expect(itemInDb?.requirementConfig).toEqual({ allowedRegions: ["de", "nl", "us", "fi"] });
		});

		it("allows overriding default fulfillment strategy (CONFIG_VPN overridden to AUTOMATED_PANEL)", async () => {
			const { bot, repliedMessages } = createTestBot();

			await bot.handleUpdate(makeCallbackQueryUpdate(1, adminChatId, "catalog:add"));
			await bot.handleUpdate(makeMessageUpdate(2, adminChatId, "Automated VPN Tier"));
			await bot.handleUpdate(makeMessageUpdate(3, adminChatId, "/skip"));
			await bot.handleUpdate(makeCallbackQueryUpdate(4, adminChatId, "catalog:type:CONFIG_VPN"));

			// Override default PAYLOAD_DELIVERY to AUTOMATED_PANEL
			await bot.handleUpdate(makeCallbackQueryUpdate(5, adminChatId, "catalog:strategy:override:AUTOMATED_PANEL"));

			// Region preset
			await bot.handleUpdate(makeCallbackQueryUpdate(6, adminChatId, "catalog:region:preset:global"));

			// Price
			await bot.handleUpdate(makeMessageUpdate(7, adminChatId, "10.00"));

			// Verify preview shows AUTOMATED_PANEL
			expect(repliedMessages[6]).toContain("پنل خودکار");

			// Confirm
			await bot.handleUpdate(makeCallbackQueryUpdate(8, adminChatId, "flow:confirm"));

			expect(repliedMessages[7]).toContain("با موفقیت ایجاد شد");

			const [itemInDb] = await db.select().from(catalogItems);
			expect(itemInDb?.name).toBe("Automated VPN Tier");
			expect(itemInDb?.catalogType).toBe("CONFIG_VPN");
			expect(itemInDb?.fulfillmentStrategy).toBe("AUTOMATED_PANEL");
			expect(itemInDb?.requirementConfig).toEqual({ allowedRegions: ["de", "nl", "us", "gb"] });
		});

		it("cancels add flow at catalog type, strategy, or region steps without creating items", async () => {
			// 1. Cancel at Catalog Type step
			const bot1 = createTestBot();
			await bot1.bot.handleUpdate(makeCallbackQueryUpdate(1, adminChatId, "catalog:add"));
			await bot1.bot.handleUpdate(makeMessageUpdate(2, adminChatId, "Item 1"));
			await bot1.bot.handleUpdate(makeMessageUpdate(3, adminChatId, "/skip"));
			await bot1.bot.handleUpdate(makeCallbackQueryUpdate(4, adminChatId, "flow:cancel"));
			expect(bot1.repliedMessages[3]).toContain("لغو شد");

			// 2. Cancel at Strategy step
			const bot2 = createTestBot();
			await bot2.bot.handleUpdate(makeCallbackQueryUpdate(1, adminChatId, "catalog:add"));
			await bot2.bot.handleUpdate(makeMessageUpdate(2, adminChatId, "Item 2"));
			await bot2.bot.handleUpdate(makeMessageUpdate(3, adminChatId, "/skip"));
			await bot2.bot.handleUpdate(makeCallbackQueryUpdate(4, adminChatId, "catalog:type:DIRECT_ACCOUNT"));
			await bot2.bot.handleUpdate(makeCallbackQueryUpdate(5, adminChatId, "flow:cancel"));
			expect(bot2.repliedMessages[4]).toContain("لغو شد");

			// 3. Cancel at Region step
			const bot3 = createTestBot();
			await bot3.bot.handleUpdate(makeCallbackQueryUpdate(1, adminChatId, "catalog:add"));
			await bot3.bot.handleUpdate(makeMessageUpdate(2, adminChatId, "Item 3"));
			await bot3.bot.handleUpdate(makeMessageUpdate(3, adminChatId, "/skip"));
			await bot3.bot.handleUpdate(makeCallbackQueryUpdate(4, adminChatId, "catalog:type:CONFIG_VPN"));
			await bot3.bot.handleUpdate(makeCallbackQueryUpdate(5, adminChatId, "catalog:strategy:confirm_default"));
			await bot3.bot.handleUpdate(makeCallbackQueryUpdate(6, adminChatId, "flow:cancel"));
			expect(bot3.repliedMessages[5]).toContain("لغو شد");

			const [countResult] = await db.select({ value: count() }).from(catalogItems);
			expect(Number(countResult?.value ?? 0)).toBe(0);
		});

		it("re-prompts when invalid input is received at catalog type, strategy, or region steps", async () => {
			const { bot, repliedMessages } = createTestBot();

			await bot.handleUpdate(makeCallbackQueryUpdate(1, adminChatId, "catalog:add"));
			await bot.handleUpdate(makeMessageUpdate(2, adminChatId, "Test Re-prompt"));
			await bot.handleUpdate(makeMessageUpdate(3, adminChatId, "/skip"));
			expect(repliedMessages[2]).toContain("نوع خدمت");

			// Invalid catalog type text
			await bot.handleUpdate(makeMessageUpdate(4, adminChatId, "INVALID_TYPE"));
			expect(repliedMessages[3]).toContain("نوع خدمت نامعتبر است");

			// Valid catalog type (typed text supported)
			await bot.handleUpdate(makeMessageUpdate(5, adminChatId, "CONFIG_VPN"));
			expect(repliedMessages[4]).toContain("استراتژی");

			// Invalid strategy input
			await bot.handleUpdate(makeMessageUpdate(6, adminChatId, "INVALID_STRAT"));
			expect(repliedMessages[5]).toContain("استراتژی پیشنهادی را تایید کنید");

			// Valid strategy confirm via text
			await bot.handleUpdate(makeMessageUpdate(7, adminChatId, "confirm"));
			expect(repliedMessages[6]).toContain("انتخاب مناطق سرور مجاز");

			// Send valid region preset
			await bot.handleUpdate(makeCallbackQueryUpdate(8, adminChatId, "catalog:region:preset:de"));
			expect(repliedMessages[7]).toContain("قیمت");

			// Valid price
			await bot.handleUpdate(makeMessageUpdate(9, adminChatId, "3.00"));
			expect(repliedMessages[8]).toContain("پیش‌نمایش خدمت جدید");

			// Confirm
			await bot.handleUpdate(makeCallbackQueryUpdate(10, adminChatId, "flow:confirm"));
			expect(repliedMessages[9]).toContain("با موفقیت ایجاد شد");

			const [itemInDb] = await db.select().from(catalogItems);
			expect(itemInDb?.name).toBe("Test Re-prompt");
			expect(itemInDb?.catalogType).toBe("CONFIG_VPN");
			expect(itemInDb?.fulfillmentStrategy).toBe("PAYLOAD_DELIVERY");
			expect(itemInDb?.requirementConfig).toEqual({ allowedRegions: ["de"] });
		});
	});

	describe("Edit Catalog Item Conversation ([Edit])", () => {
		it("walks Admin through edit flow with [Keep] to update selected fields", async () => {
			const item = await createTestCatalogItem(container, {
				name: "Original Service",
				description: "Original Description",
				usdPrice: "20.00",
			});

			const { bot, repliedMessages } = createTestBot();

			// Step 1: Click [Edit]
			await bot.handleUpdate(makeCallbackQueryUpdate(1, adminChatId, `catalog:edit:${item.id}`));

			expect(repliedMessages[0]).toContain("Original Service");
			expect(repliedMessages[0]).toContain("نام جدید");

			// Step 2: Keep current name
			await bot.handleUpdate(makeMessageUpdate(2, adminChatId, "/keep"));

			expect(repliedMessages[1]).toContain("توضیحات جدید");
			expect(repliedMessages[1]).toContain("Original Description");

			// Step 3: Enter new description
			await bot.handleUpdate(makeMessageUpdate(3, adminChatId, "Updated Description"));

			expect(repliedMessages[2]).toContain("قیمت جدید");
			expect(repliedMessages[2]).toContain("20.00");

			// Step 4: Enter new price
			await bot.handleUpdate(makeMessageUpdate(4, adminChatId, "24.99"));

			expect(repliedMessages[3]).toContain("به‌روزرسانی شد");

			const [updatedInDb] = await db.select().from(catalogItems).where(eq(catalogItems.id, item.id));

			expect(updatedInDb?.name).toBe("Original Service");
			expect(updatedInDb?.description).toBe("Updated Description");
			expect(updatedInDb?.usdPrice).toBe("24.99");
		});

		it("cancels edit flow when /cancel is sent", async () => {
			const item = await createTestCatalogItem(container, {
				name: "Cancel Test Service",
				usdPrice: "10.00",
			});

			const { bot, repliedMessages } = createTestBot();

			await bot.handleUpdate(makeCallbackQueryUpdate(1, adminChatId, `catalog:edit:${item.id}`));
			await bot.handleUpdate(makeMessageUpdate(2, adminChatId, "/cancel"));

			expect(repliedMessages[1]).toContain("لغو شد");

			const [inDb] = await db.select().from(catalogItems).where(eq(catalogItems.id, item.id));

			expect(inDb?.name).toBe("Cancel Test Service");
			expect(inDb?.usdPrice).toBe("10.00");
		});
	});
});
