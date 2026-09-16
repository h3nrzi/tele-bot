import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
	TelegramOtcPurchaseNotifier,
	resolveOtcRecipients,
	formatOtcPurchaseSuccessMessage,
	formatOtcPurchaseFailureMessage,
	getOtcRetryKeyboard,
} from "@/bot/handlers/admin/otc-purchase.notifier";
import { OtcPurchase } from "@/modules/otc-purchase/otc-purchase.entity";

describe("TelegramOtcPurchaseNotifier", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		delete process.env.TELEGRAM_OPS_GROUP_ID;
		delete process.env.ADMIN_IDS;
	});

	afterEach(() => {
		process.env = { ...originalEnv };
	});

	describe("resolveOtcRecipients", () => {
		it("returns TELEGRAM_OPS_GROUP_ID when set", () => {
			process.env.TELEGRAM_OPS_GROUP_ID = "-1001234567890";
			process.env.ADMIN_IDS = "111,222";

			const recipients = resolveOtcRecipients({});
			expect(recipients).toEqual(["-1001234567890"]);
		});

		it("falls back to ADMIN_IDS when ops group is not set", () => {
			process.env.ADMIN_IDS = "111,222";

			const recipients = resolveOtcRecipients({});
			expect(recipients).toEqual([111, 222]);
		});

		it("prefers options.opsGroupId when explicitly passed", () => {
			process.env.TELEGRAM_OPS_GROUP_ID = "-100999";
			const recipients = resolveOtcRecipients({ opsGroupId: "-100888" });
			expect(recipients).toEqual(["-100888"]);
		});
	});

	describe("message formatting", () => {
		const purchase = new OtcPurchase({
			id: "otc-test-1",
			topUpRequestId: "req-test-1",
			usdtQuantity: "100.00",
			status: "COMPLETED",
			wallexClientOrderId: "wallex-12345",
			wallexExecutedPrice: 6000000n, // 600,000 TMN
			wallexExecutedQty: "100.00",
			wallexExecutedSum: 600000000n, // 60,000,000 TMN
			wallexFee: 600000n, // 60,000 TMN
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		it("formats success message with execution details in Toman", () => {
			const msg = formatOtcPurchaseSuccessMessage(purchase);
			expect(msg).toContain("خرید خودکار تتر از والکس با موفقیت انجام شد");
			expect(msg).toContain("100.00");
			expect(msg).toContain("`60,000,000` تومان"); // 600,000,000 / 10
			expect(msg).toContain("`600,000` تومان"); // 6,000,000 / 10
			expect(msg).toContain("`60,000` تومان"); // 600,000 / 10
			expect(msg).toContain("wallex-12345");
			expect(msg).toContain("req-test-1");
		});

		it("formats failure message with error and top-up details", () => {
			const failedPurchase = new OtcPurchase({
				id: "otc-test-2",
				topUpRequestId: "req-test-2",
				usdtQuantity: "50.00",
				status: "FAILED",
				errorMessage: "Network timeout connecting to Wallex",
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const msg = formatOtcPurchaseFailureMessage(failedPurchase);
			expect(msg).toContain("خطا در خرید خودکار تتر از والکس");
			expect(msg).toContain("50.00");
			expect(msg).toContain("Network timeout connecting to Wallex");
			expect(msg).toContain("req-test-2");
		});

		it("builds retry inline keyboard with otc:retry callback", () => {
			const kb = getOtcRetryKeyboard("otc-test-2");
			expect(kb.inline_keyboard[0]![0]!.text).toContain("تلاش مجدد");
			expect((kb.inline_keyboard[0]![0]! as any).callback_data).toBe("otc:retry:otc-test-2");
		});
	});

	describe("dispatching via api.sendMessage", () => {
		it("notifies success to configured ops group", async () => {
			const sentMessages: any[] = [];
			const mockApi = {
				sendMessage: vi.fn(async (chatId, text, opts) => {
					sentMessages.push({ chatId, text, opts });
				}),
			};

			const notifier = new TelegramOtcPurchaseNotifier({
				api: mockApi,
				opsGroupId: "-100999888",
			});

			const purchase = new OtcPurchase({
				id: "otc-1",
				topUpRequestId: "req-1",
				usdtQuantity: "25.00",
				status: "COMPLETED",
				wallexClientOrderId: "wallex-1",
				wallexExecutedPrice: 6000000n,
				wallexExecutedQty: "25.00",
				wallexExecutedSum: 150000000n,
				wallexFee: 150000n,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await notifier.notifySuccess(purchase);

			expect(mockApi.sendMessage).toHaveBeenCalledTimes(1);
			expect(sentMessages[0].chatId).toBe("-100999888");
			expect(sentMessages[0].text).toContain("موفقیت");
		});

		it("notifies failure to each admin when ops group is absent, attaching retry keyboard", async () => {
			const sentMessages: any[] = [];
			const mockApi = {
				sendMessage: vi.fn(async (chatId, text, opts) => {
					sentMessages.push({ chatId, text, opts });
				}),
			};

			const notifier = new TelegramOtcPurchaseNotifier({
				api: mockApi,
				adminIds: new Set([111n, 222n]),
			});

			const purchase = new OtcPurchase({
				id: "otc-fail-1",
				topUpRequestId: "req-fail-1",
				usdtQuantity: "50.00",
				status: "FAILED",
				errorMessage: "Insufficient TMN",
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await notifier.notifyFailure(purchase, "Insufficient TMN");

			expect(mockApi.sendMessage).toHaveBeenCalledTimes(2);
			expect(sentMessages[0].chatId).toBe(111);
			expect(sentMessages[1].chatId).toBe(222);
			expect(sentMessages[0].opts.reply_markup).toBeDefined();
			expect(sentMessages[0].opts.reply_markup.inline_keyboard[0][0].callback_data).toBe("otc:retry:otc-fail-1");
		});
	});
});
