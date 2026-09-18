import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
	TelegramOrderNotifier,
	formatAdminOrderPlacedMessage,
	formatAdminBuyerInputs,
	formatBuyerOrderFulfilledMessage,
	formatBuyerOrderRejectedMessage,
	formatBuyerOrderCancelledMessage,
} from "@/bot/notifications/order.notifier";
import { Order, OrderAdminNotification } from "@/modules/order/order.entity";
import { Buyer } from "@/modules/buyer/buyer.entity";
import { CatalogItem } from "@/modules/catalog/catalog.entity";

describe("TelegramOrderNotifier", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		delete process.env.ADMIN_IDS;
	});

	afterEach(() => {
		process.env = { ...originalEnv };
	});

	const dummyBuyer = new Buyer({
		id: "buyer-uuid-1",
		telegramChatId: 987654321n,
		telegramUsername: "testbuyer",
		createdAt: new Date(),
	});

	const dummyItem = new CatalogItem({
		id: "item-uuid-1",
		name: "Telegram Premium 1 Year",
		usdPrice: "29.99",
		description: "12-month subscription activation",
		isActive: true,
		createdAt: new Date(),
		updatedAt: new Date(),
	});

	const dummyOrder = new Order({
		id: "order-uuid-1234-5678-9012",
		userId: "buyer-uuid-1",
		catalogItemId: "item-uuid-1",
		status: "PLACED",
		usdPriceSnapshot: "29.99",
		createdAt: new Date(),
		updatedAt: new Date(),
	});

	describe("Message Formatting Helpers", () => {
		it("formatAdminOrderPlacedMessage formats order placed details for admins", () => {
			const msg = formatAdminOrderPlacedMessage({
				order: dummyOrder,
				catalogItem: dummyItem,
				buyer: dummyBuyer,
				postDebitBalance: "70.01",
			});

			expect(msg).toContain("📦 سفارش جدید ثبت شد");
			expect(msg).toContain("#order-uuid-1234-5678-9012");
			expect(msg).toContain("@testbuyer (شناسه: 987654321)");
			expect(msg).toContain("Telegram Premium 1 Year");
			expect(msg).toContain("12-month subscription activation");
			expect(msg).toContain("$29.99");
			expect(msg).toContain("$70.01");
		});

		it("formatAdminOrderPlacedMessage formats buyerInputs with masked password for initial broadcast", () => {
			const orderWithInputs = new Order({
				id: "order-uuid-account-1",
				userId: "buyer-uuid-1",
				catalogItemId: "item-uuid-1",
				status: "PLACED",
				usdPriceSnapshot: "15.00",
				buyerInputs: {
					email: "user@example.com",
					password: {
						ciphertext: "aabbcc",
						iv: "112233",
						tag: "445566",
					},
				},
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const msg = formatAdminOrderPlacedMessage({
				order: orderWithInputs,
				catalogItem: dummyItem,
				buyer: dummyBuyer,
				postDebitBalance: "35.00",
			});

			expect(msg).toContain("📧 ایمیل: user@example.com");
			expect(msg).toContain("🔑 رمز عبور: 🔒 پس از شروع پردازش نمایش داده می‌شود");
			expect(msg).not.toContain("aabbcc");
		});

		it("formatAdminOrderPlacedMessage formats buyerInputs with revealed password when decryptedPassword option is provided", () => {
			const orderWithInputs = new Order({
				id: "order-uuid-account-1",
				userId: "buyer-uuid-1",
				catalogItemId: "item-uuid-1",
				status: "PROCESSING",
				usdPriceSnapshot: "15.00",
				buyerInputs: {
					email: "user@example.com",
					password: {
						ciphertext: "aabbcc",
						iv: "112233",
						tag: "445566",
					},
				},
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const msg = formatAdminOrderPlacedMessage(
				{
					order: orderWithInputs,
					catalogItem: dummyItem,
					buyer: dummyBuyer,
				},
				{ decryptedPassword: "SuperSecretPassword123!" },
			);

			expect(msg).toContain("📧 ایمیل: user@example.com");
			expect(msg).toContain("🔑 رمز عبور: SuperSecretPassword123!");
			expect(msg).not.toContain("🔒 پس از شروع پردازش نمایش داده می‌شود");
		});

		it("formatAdminOrderPlacedMessage formats targetUsername and VPN region correctly", () => {
			const orderHandle = new Order({
				id: "order-uuid-handle-1",
				userId: "buyer-uuid-1",
				catalogItemId: "item-uuid-1",
				status: "PLACED",
				usdPriceSnapshot: "5.00",
				buyerInputs: {
					targetUsername: "@recipient_friend",
				},
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const msgHandle = formatAdminOrderPlacedMessage({
				order: orderHandle,
				catalogItem: dummyItem,
				buyer: dummyBuyer,
			});
			expect(msgHandle).toContain("👤 شناسه / نام کاربری مقصد: @recipient_friend");

			const orderVpn = new Order({
				id: "order-uuid-vpn-1",
				userId: "buyer-uuid-1",
				catalogItemId: "item-uuid-1",
				status: "PLACED",
				usdPriceSnapshot: "5.00",
				buyerInputs: {
					region: "de",
				},
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const msgVpn = formatAdminOrderPlacedMessage({
				order: orderVpn,
				catalogItem: dummyItem,
				buyer: dummyBuyer,
			});
			expect(msgVpn).toContain("🌐 منطقه سرور: 🇩🇪 آلمان (de)");
		});

		it("formatAdminOrderPlacedMessage handles buyer without username and item without description", () => {
			const buyerWithoutUsername = new Buyer({
				id: "buyer-uuid-2",
				telegramChatId: 123456n,
				telegramUsername: null,
				createdAt: new Date(),
			});
			const itemWithoutDesc = new CatalogItem({
				id: "item-uuid-2",
				name: "Simple Item",
				usdPrice: "5.00",
				description: null,
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const msg = formatAdminOrderPlacedMessage({
				order: dummyOrder,
				catalogItem: itemWithoutDesc,
				buyer: buyerWithoutUsername,
				postDebitBalance: "15.00",
			});

			expect(msg).toContain("شناسه: 123456");
			expect(msg).not.toContain("@");
			expect(msg).not.toContain("توضیحات:");
		});

		it("formatBuyerOrderFulfilledMessage formats delivery message for buyer", () => {
			const msg = formatBuyerOrderFulfilledMessage("Code: ABCD-1234-EFGH");
			expect(msg).toContain("📦 سفارش شما با موفقیت تحویل داده شد!");
			expect(msg).toContain("Code: ABCD-1234-EFGH");
			expect(msg).toContain("با تشکر از خرید شما.");
		});

		it("formatBuyerOrderRejectedMessage formats rejection notice for buyer with category label", () => {
			const msg = formatBuyerOrderRejectedMessage({
				orderId: "order-uuid-1234-5678-9012",
				rejectionCategory: "OUT_OF_STOCK",
				rejectionNote: "Will restock tomorrow",
				refundAmount: "29.99",
				updatedBalance: "100.00",
			});

			expect(msg).toContain("❌ *سفارش شما رد شد*");
			expect(msg).toContain("#order-uu"); // short order ID
			expect(msg).toContain("عدم موجودی / ناموجود موقت");
			expect(msg).toContain("Out of stock / temporarily unavailable");
			expect(msg).toContain("Will restock tomorrow");
			expect(msg).toContain("$29.99");
			expect(msg).toContain("$100.00");
		});

		it("formatBuyerOrderCancelledMessage formats cancellation notice for buyer", () => {
			const msg = formatBuyerOrderCancelledMessage({
				orderId: "order-uuid-1234-5678-9012",
				refundAmount: "29.99",
				updatedBalance: "100.00",
			});

			expect(msg).toContain("✅ *سفارش شما با موفقیت لغو شد*");
			expect(msg).toContain("#order-uuid-1234-5678-9012");
			expect(msg).toContain("$29.99");
			expect(msg).toContain("$100.00");
		});
	});

	describe("onOrderPlaced", () => {
		it("sends push message to each admin and persists notification records in orderRepo", async () => {
			const sentMessages: any[] = [];
			const mockApi = {
				sendMessage: vi.fn(async (chatId, text, opts) => {
					const messageId = sentMessages.length + 101;
					sentMessages.push({ chatId, text, opts, messageId });
					return {
						chat: { id: chatId },
						message_id: messageId,
					};
				}),
				editMessageReplyMarkup: vi.fn(),
			};

			const mockOrderRepo = {
				createAdminNotifications: vi.fn(async (params) => params),
			};

			const notifier = new TelegramOrderNotifier({
				api: mockApi,
				adminIds: "111222,333444",
				orderRepo: mockOrderRepo as any,
			});

			await notifier.onOrderPlaced({
				order: dummyOrder,
				catalogItem: dummyItem,
				buyer: dummyBuyer,
				postDebitBalance: "70.01",
			});

			expect(mockApi.sendMessage).toHaveBeenCalledTimes(2);
			expect(sentMessages[0].chatId).toBe(111222);
			expect(sentMessages[1].chatId).toBe(333444);
			expect(sentMessages[0].opts.reply_markup).toBeDefined();
			expect(sentMessages[0].opts.reply_markup.inline_keyboard[0][0].callback_data).toBe(
				`order:process:${dummyOrder.id}`,
			);

			expect(mockOrderRepo.createAdminNotifications).toHaveBeenCalledTimes(1);
			expect(mockOrderRepo.createAdminNotifications).toHaveBeenCalledWith([
				{
					orderId: dummyOrder.id,
					adminTelegramId: 111222n,
					chatId: 111222n,
					messageId: 101n,
				},
				{
					orderId: dummyOrder.id,
					adminTelegramId: 333444n,
					chatId: 333444n,
					messageId: 102n,
				},
			]);
		});

		it("resilient against individual admin send failures: continues and saves successful ones", async () => {
			const mockApi = {
				sendMessage: vi.fn(async (chatId) => {
					if (chatId === 111222) {
						throw new Error("Blocked by user");
					}
					return {
						chat: { id: chatId },
						message_id: 202,
					};
				}),
				editMessageReplyMarkup: vi.fn(),
			};

			const mockOrderRepo = {
				createAdminNotifications: vi.fn(async (params) => params),
			};

			const notifier = new TelegramOrderNotifier({
				api: mockApi,
				adminIds: "111222,333444",
				orderRepo: mockOrderRepo as any,
			});

			await notifier.onOrderPlaced({
				order: dummyOrder,
				catalogItem: dummyItem,
				buyer: dummyBuyer,
				postDebitBalance: "70.01",
			});

			expect(mockApi.sendMessage).toHaveBeenCalledTimes(2);
			expect(mockOrderRepo.createAdminNotifications).toHaveBeenCalledWith([
				{
					orderId: dummyOrder.id,
					adminTelegramId: 333444n,
					chatId: 333444n,
					messageId: 202n,
				},
			]);
		});
	});

	describe("onOrderClaimed", () => {
		it("edits admin notification keyboards to processing layout with admin username", async () => {
			const edited: any[] = [];
			const mockApi = {
				sendMessage: vi.fn(),
				editMessageReplyMarkup: vi.fn(async (chatId, messageId, opts) => {
					edited.push({ chatId, messageId, opts });
				}),
			};

			const notifier = new TelegramOrderNotifier({
				api: mockApi,
				adminIds: "111222",
			});

			const notif1 = new OrderAdminNotification({
				id: "notif-1",
				orderId: dummyOrder.id,
				adminTelegramId: 111222n,
				chatId: 111222n,
				messageId: 101n,
				createdAt: new Date(),
			});
			const notif2 = new OrderAdminNotification({
				id: "notif-2",
				orderId: dummyOrder.id,
				adminTelegramId: 333444n,
				chatId: 333444n,
				messageId: 102n,
				createdAt: new Date(),
			});

			await notifier.onOrderClaimed({
				order: dummyOrder,
				notifications: [notif1, notif2],
				claimedByAdminTelegramId: 111222n,
				claimedByAdminUsername: "superadmin",
			});

			expect(mockApi.editMessageReplyMarkup).toHaveBeenCalledTimes(2);
			expect(edited[0].chatId).toBe(111222);
			expect(edited[0].messageId).toBe(101);
			expect(edited[0].opts.reply_markup.inline_keyboard[0][0].text).toContain("@superadmin");
			expect(edited[0].opts.reply_markup.inline_keyboard[1][0].callback_data).toBe(`order:fulfil:${dummyOrder.id}`);
		});

		it("decrypts password and edits message text for claiming admin while keeping other admins masked", async () => {
			const editedMarkup: any[] = [];
			const editedText: any[] = [];
			const mockApi = {
				sendMessage: vi.fn(),
				editMessageReplyMarkup: vi.fn(async (chatId, messageId, opts) => {
					editedMarkup.push({ chatId, messageId, opts });
				}),
				editMessageText: vi.fn(async (chatId, messageId, text, opts) => {
					editedText.push({ chatId, messageId, text, opts });
				}),
			};

			const mockCryptoService = {
				encrypt: vi.fn(),
				decrypt: vi.fn((_payload) => "DecryptedSecretPassword999!"),
			};

			const notifier = new TelegramOrderNotifier({
				api: mockApi,
				adminIds: "111222,333444",
				cryptoService: mockCryptoService as any,
			});

			const orderWithEncryptedPw = new Order({
				id: "order-uuid-pw-1",
				userId: dummyBuyer.id,
				catalogItemId: dummyItem.id,
				status: "PROCESSING",
				usdPriceSnapshot: "15.00",
				buyerInputs: {
					email: "vip@example.com",
					password: {
						ciphertext: "dummycipher",
						iv: "dummyiv",
						tag: "dummytag",
					},
				},
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const notif1 = new OrderAdminNotification({
				id: "notif-1",
				orderId: orderWithEncryptedPw.id,
				adminTelegramId: 111222n,
				chatId: 111222n,
				messageId: 101n,
				createdAt: new Date(),
			});
			const notif2 = new OrderAdminNotification({
				id: "notif-2",
				orderId: orderWithEncryptedPw.id,
				adminTelegramId: 333444n,
				chatId: 333444n,
				messageId: 102n,
				createdAt: new Date(),
			});

			await notifier.onOrderClaimed({
				order: orderWithEncryptedPw,
				catalogItem: dummyItem,
				buyer: dummyBuyer,
				notifications: [notif1, notif2],
				claimedByAdminTelegramId: 111222n,
				claimedByAdminUsername: "claiming_admin",
			});

			// Claiming admin (111222) gets editMessageText with decrypted credentials
			expect(mockApi.editMessageText).toHaveBeenCalledTimes(1);
			expect(editedText).toHaveLength(1);
			expect(editedText[0].chatId).toBe(111222);
			expect(editedText[0].messageId).toBe(101);
			expect(editedText[0].text).toContain("🔑 رمز عبور: DecryptedSecretPassword999!");
			expect(editedText[0].text).toContain("📧 ایمیل: vip@example.com");
			expect(editedText[0].opts.reply_markup.inline_keyboard[0][0].text).toContain("@claiming_admin");

			// Non-claiming admin (333444) gets editMessageReplyMarkup ONLY (no decrypted text sent)
			expect(mockApi.editMessageReplyMarkup).toHaveBeenCalledTimes(1);
			expect(editedMarkup).toHaveLength(1);
			expect(editedMarkup[0].chatId).toBe(333444);
			expect(editedMarkup[0].messageId).toBe(102);
			expect(editedMarkup[0].opts.reply_markup.inline_keyboard[0][0].text).toContain("@claiming_admin");
		});

		it("falls back to editMessageReplyMarkup when decryption fails without crashing", async () => {
			const editedMarkup: any[] = [];
			const mockApi = {
				sendMessage: vi.fn(),
				editMessageReplyMarkup: vi.fn(async (chatId, messageId, opts) => {
					editedMarkup.push({ chatId, messageId, opts });
				}),
				editMessageText: vi.fn(),
			};

			const mockCryptoService = {
				encrypt: vi.fn(),
				decrypt: vi.fn(() => {
					throw new Error("Tampered ciphertext");
				}),
			};

			const notifier = new TelegramOrderNotifier({
				api: mockApi,
				adminIds: "111222",
				cryptoService: mockCryptoService as any,
			});

			const orderWithBadPw = new Order({
				id: "order-uuid-pw-2",
				userId: dummyBuyer.id,
				catalogItemId: dummyItem.id,
				status: "PROCESSING",
				usdPriceSnapshot: "15.00",
				buyerInputs: {
					email: "bad@example.com",
					password: {
						ciphertext: "corrupt",
						iv: "corrupt",
						tag: "corrupt",
					},
				},
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const notif1 = new OrderAdminNotification({
				id: "notif-1",
				orderId: orderWithBadPw.id,
				adminTelegramId: 111222n,
				chatId: 111222n,
				messageId: 101n,
				createdAt: new Date(),
			});

			await notifier.onOrderClaimed({
				order: orderWithBadPw,
				catalogItem: dummyItem,
				buyer: dummyBuyer,
				notifications: [notif1],
				claimedByAdminTelegramId: 111222n,
			});

			// When decryption fails, editMessageText is NOT called; falls back to editMessageReplyMarkup
			expect(mockApi.editMessageText).not.toHaveBeenCalled();
			expect(mockApi.editMessageReplyMarkup).toHaveBeenCalledTimes(1);
		});
	});

	describe("onOrderFulfilled", () => {
		it("sends delivery content to buyer and edits admin notifications to fulfilled layout", async () => {
			const sentMessages: any[] = [];
			const edited: any[] = [];
			const mockApi = {
				sendMessage: vi.fn(async (chatId, text, opts) => {
					sentMessages.push({ chatId, text, opts });
				}),
				editMessageReplyMarkup: vi.fn(async (chatId, messageId, opts) => {
					edited.push({ chatId, messageId, opts });
				}),
			};

			const notifier = new TelegramOrderNotifier({
				api: mockApi,
			});

			const notif = new OrderAdminNotification({
				id: "notif-1",
				orderId: dummyOrder.id,
				adminTelegramId: 111222n,
				chatId: 111222n,
				messageId: 101n,
				createdAt: new Date(),
			});

			await notifier.onOrderFulfilled({
				order: dummyOrder,
				buyer: dummyBuyer,
				deliveryContent: "License key: XYZ-123",
				notifications: [notif],
				adminTelegramId: 111222n,
			});

			// 1. Sent to buyer
			expect(mockApi.sendMessage).toHaveBeenCalledTimes(1);
			expect(sentMessages[0].chatId).toBe("987654321");
			expect(sentMessages[0].text).toContain("License key: XYZ-123");

			// 2. Edited admin notification
			expect(mockApi.editMessageReplyMarkup).toHaveBeenCalledTimes(1);
			expect(edited[0].chatId).toBe(111222);
			expect(edited[0].messageId).toBe(101);
			expect(edited[0].opts.reply_markup.inline_keyboard[0][0].text).toContain("✅ تکمیل شده توسط 111222");
		});

		it("edits admin notification with admin username when adminUsername is provided", async () => {
			const edited: any[] = [];
			const mockApi = {
				sendMessage: vi.fn(),
				editMessageReplyMarkup: vi.fn(async (chatId, messageId, opts) => {
					edited.push({ chatId, messageId, opts });
				}),
			};

			const notifier = new TelegramOrderNotifier({
				api: mockApi,
			});

			const notif = new OrderAdminNotification({
				id: "notif-1",
				orderId: dummyOrder.id,
				adminTelegramId: 111222n,
				chatId: 111222n,
				messageId: 101n,
				createdAt: new Date(),
			});

			await notifier.onOrderFulfilled({
				order: dummyOrder,
				buyer: dummyBuyer,
				deliveryContent: "License key: XYZ-123",
				notifications: [notif],
				adminTelegramId: 111222n,
				adminUsername: "@superadmin",
			});

			expect(mockApi.editMessageReplyMarkup).toHaveBeenCalledTimes(1);
			expect(edited[0].opts.reply_markup.inline_keyboard[0][0].text).toContain("✅ تکمیل شده توسط @superadmin");
		});

		it("sends dedicated activation message to buyer without empty payload sections for ACTIVATION orders", async () => {
			const sentMessages: any[] = [];
			const edited: any[] = [];
			const mockApi = {
				sendMessage: vi.fn(async (chatId, text, opts) => {
					sentMessages.push({ chatId, text, opts });
				}),
				editMessageReplyMarkup: vi.fn(async (chatId, messageId, opts) => {
					edited.push({ chatId, messageId, opts });
				}),
			};

			const notifier = new TelegramOrderNotifier({
				api: mockApi,
			});

			const activationOrder = new Order({
				id: "order-uuid-activation-1234",
				userId: dummyBuyer.id,
				catalogItemId: "item-uuid-spotify",
				status: "PROCESSING",
				fulfillmentStrategySnapshot: "ACTIVATION",
				buyerInputs: { email: "buyer@example.com" },
				usdPriceSnapshot: "15.00",
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const notif = new OrderAdminNotification({
				id: "notif-activation-1",
				orderId: activationOrder.id,
				adminTelegramId: 111222n,
				chatId: 111222n,
				messageId: 201n,
				createdAt: new Date(),
			});

			await notifier.onOrderFulfilled({
				order: activationOrder,
				buyer: dummyBuyer,
				notifications: [notif],
				adminTelegramId: 111222n,
				adminUsername: "@support_admin",
			});

			// 1. Sent to buyer
			expect(mockApi.sendMessage).toHaveBeenCalledTimes(1);
			expect(sentMessages[0].chatId).toBe("987654321");
			const buyerMsg = sentMessages[0].text;
			// Dedicated Persian activation notice
			expect(buyerMsg).toContain("فعال‌سازی");
			expect(buyerMsg).toMatch(/ارتقا|فعال/);
			expect(buyerMsg).toContain("با تشکر از خرید شما");
			// Must NOT contain empty payload sections
			expect(buyerMsg).not.toContain("اطلاعات تحویل سفارش");
			expect(buyerMsg).not.toContain("undefined");
			expect(buyerMsg).not.toContain("null");

			// 2. Admin notification updated to fulfilled layout
			expect(mockApi.editMessageReplyMarkup).toHaveBeenCalledTimes(1);
			expect(edited[0].opts.reply_markup.inline_keyboard[0][0].text).toContain("✅ تکمیل شده توسط @support_admin");
		});
	});

	describe("onOrderRejected", () => {
		it("sends rejection message with category/note/refund to buyer and edits admin notifications", async () => {
			const sentMessages: any[] = [];
			const edited: any[] = [];
			const mockApi = {
				sendMessage: vi.fn(async (chatId, text, opts) => {
					sentMessages.push({ chatId, text, opts });
				}),
				editMessageReplyMarkup: vi.fn(async (chatId, messageId, opts) => {
					edited.push({ chatId, messageId, opts });
				}),
			};

			const notifier = new TelegramOrderNotifier({
				api: mockApi,
			});

			const notif = new OrderAdminNotification({
				id: "notif-1",
				orderId: dummyOrder.id,
				adminTelegramId: 111222n,
				chatId: 111222n,
				messageId: 101n,
				createdAt: new Date(),
			});

			await notifier.onOrderRejected({
				order: dummyOrder,
				buyer: dummyBuyer,
				rejectionCategory: "OUT_OF_STOCK",
				rejectionNote: "Item out of stock",
				refundAmount: "29.99",
				updatedBalance: "100.00",
				notifications: [notif],
				adminTelegramId: 111222n,
			});

			expect(mockApi.sendMessage).toHaveBeenCalledTimes(1);
			expect(sentMessages[0].chatId).toBe("987654321");
			expect(sentMessages[0].text).toContain("عدم موجودی");
			expect(sentMessages[0].text).toContain("Item out of stock");
			expect(sentMessages[0].opts.parse_mode).toBe("Markdown");

			expect(mockApi.editMessageReplyMarkup).toHaveBeenCalledTimes(1);
			expect(edited[0].opts.reply_markup.inline_keyboard[0][0].text).toContain("❌ رد شده توسط 111222");
		});

		it("edits admin notification with admin username on rejection when adminUsername is provided", async () => {
			const edited: any[] = [];
			const mockApi = {
				sendMessage: vi.fn(),
				editMessageReplyMarkup: vi.fn(async (chatId, messageId, opts) => {
					edited.push({ chatId, messageId, opts });
				}),
			};

			const notifier = new TelegramOrderNotifier({
				api: mockApi,
			});

			const notif = new OrderAdminNotification({
				id: "notif-1",
				orderId: dummyOrder.id,
				adminTelegramId: 111222n,
				chatId: 111222n,
				messageId: 101n,
				createdAt: new Date(),
			});

			await notifier.onOrderRejected({
				order: dummyOrder,
				buyer: dummyBuyer,
				rejectionCategory: "OUT_OF_STOCK",
				refundAmount: "29.99",
				updatedBalance: "100.00",
				notifications: [notif],
				adminTelegramId: 111222n,
				adminUsername: "@rejecting_lead",
			});

			expect(mockApi.editMessageReplyMarkup).toHaveBeenCalledTimes(1);
			expect(edited[0].opts.reply_markup.inline_keyboard[0][0].text).toContain("❌ رد شده توسط @rejecting_lead");
		});

		it("falls back to sending plain text if markdown entity parsing fails", async () => {
			const sentMessages: any[] = [];
			const mockApi = {
				sendMessage: vi
					.fn()
					.mockRejectedValueOnce(new Error("Bad Request: can't parse entities in message"))
					.mockImplementationOnce(async (chatId, text, opts) => {
						sentMessages.push({ chatId, text, opts });
					}),
				editMessageReplyMarkup: vi.fn(),
			};

			const notifier = new TelegramOrderNotifier({
				api: mockApi,
			});

			await notifier.onOrderRejected({
				order: dummyOrder,
				buyer: dummyBuyer,
				rejectionCategory: "OUT_OF_STOCK",
				rejectionNote: "bad markdown _ test *",
				refundAmount: "29.99",
				updatedBalance: "100.00",
				notifications: [],
			});

			expect(mockApi.sendMessage).toHaveBeenCalledTimes(2);
			expect(sentMessages[0].opts?.parse_mode).toBeUndefined();
		});
	});

	describe("onOrderCancelled", () => {
		it("sends cancellation notice to buyer and edits admin notifications to cancelled layout", async () => {
			const sentMessages: any[] = [];
			const edited: any[] = [];
			const mockApi = {
				sendMessage: vi.fn(async (chatId, text, opts) => {
					sentMessages.push({ chatId, text, opts });
				}),
				editMessageReplyMarkup: vi.fn(async (chatId, messageId, opts) => {
					edited.push({ chatId, messageId, opts });
				}),
			};

			const notifier = new TelegramOrderNotifier({
				api: mockApi,
			});

			const notif = new OrderAdminNotification({
				id: "notif-1",
				orderId: dummyOrder.id,
				adminTelegramId: 111222n,
				chatId: 111222n,
				messageId: 101n,
				createdAt: new Date(),
			});

			await notifier.onOrderCancelled({
				order: dummyOrder,
				buyer: dummyBuyer,
				refundAmount: "29.99",
				updatedBalance: "100.00",
				notifications: [notif],
			});

			expect(mockApi.sendMessage).toHaveBeenCalledTimes(1);
			expect(sentMessages[0].chatId).toBe("987654321");
			expect(sentMessages[0].text).toContain("لغو شد");

			expect(mockApi.editMessageReplyMarkup).toHaveBeenCalledTimes(1);
			expect(edited[0].opts.reply_markup.inline_keyboard[0][0].text).toContain("🚫 لغو شده توسط خریدار");
		});
	});

	describe("Constructor Overloads", () => {
		it("supports (botOrApi, adminIds, orderRepo) argument style", async () => {
			const mockApi = {
				sendMessage: vi.fn(),
				editMessageReplyMarkup: vi.fn(),
			};
			const mockOrderRepo = {
				createAdminNotifications: vi.fn(),
			};

			const notifier = new TelegramOrderNotifier(mockApi as any, new Set([999n]), mockOrderRepo as any);

			expect(notifier).toBeInstanceOf(TelegramOrderNotifier);
		});

		it("supports Bot instance as first argument", () => {
			const mockBot = {
				api: {
					sendMessage: vi.fn(),
					editMessageReplyMarkup: vi.fn(),
				},
				use: vi.fn(),
			};

			const notifier = new TelegramOrderNotifier(mockBot as any, "555,666");

			expect(notifier).toBeInstanceOf(TelegramOrderNotifier);
		});
	});
});
