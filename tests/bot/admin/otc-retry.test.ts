import { describe, it, expect, vi } from "vitest";
import type { Context } from "grammy";
import { handleOtcRetryCallback } from "@/bot/admin/handlers/otc-retry.handler";
import {
	DuplicateActiveOtcPurchaseError,
	InvalidOtcPurchaseStateError,
	OtcPurchaseNotFoundError,
} from "@/modules/otc-purchase/otc-purchase.errors";

function createMockRetryContext(options: { callbackData?: string; fromId?: number }) {
	const answeredQueries: Array<{ text?: string; show_alert?: boolean }> = [];

	const ctx = {
		from: {
			id: options.fromId ?? 123456,
			is_bot: false,
			first_name: "Admin",
			username: "admin_user",
		},
		callbackQuery: options.callbackData
			? {
					id: "cb_query_1",
					data: options.callbackData,
					from: { id: options.fromId ?? 123456, first_name: "Admin" },
				}
			: undefined,
		answerCallbackQuery: vi.fn(async (arg?: any) => {
			if (typeof arg === "string") {
				answeredQueries.push({ text: arg });
			} else {
				answeredQueries.push(arg ?? {});
			}
		}),
	} as unknown as Context;

	return { ctx, answeredQueries };
}

describe("handleOtcRetryCallback", () => {
	it("parses purchase ID, acknowledges query, and calls otcPurchaseService.retry() with success", async () => {
		const { ctx, answeredQueries } = createMockRetryContext({
			callbackData: "otc:retry:purchase-abc-123",
		});

		const mockService = {
			retry: vi.fn().mockResolvedValue({
				id: "purchase-new",
				status: "COMPLETED",
				isFailed: () => false,
			}),
		} as any;

		await handleOtcRetryCallback(ctx, { otcPurchaseService: mockService });

		expect(answeredQueries).toHaveLength(1);
		expect(answeredQueries[0]!.text).toContain("با موفقیت");
		expect(mockService.retry).toHaveBeenCalledWith("purchase-abc-123");
	});

	it("shows alert when retry execution completes with FAILED status", async () => {
		const { ctx, answeredQueries } = createMockRetryContext({
			callbackData: "otc:retry:purchase-abc-123",
		});

		const mockService = {
			retry: vi.fn().mockResolvedValue({
				id: "purchase-new",
				status: "FAILED",
				errorMessage: "Still insufficient balance",
				isFailed: () => true,
			}),
		} as any;

		await handleOtcRetryCallback(ctx, { otcPurchaseService: mockService });

		expect(answeredQueries).toHaveLength(1);
		expect(answeredQueries[0]!.show_alert).toBe(true);
		expect(answeredQueries[0]!.text).toContain("Still insufficient balance");
	});

	it("handles invalid callback data format", async () => {
		const { ctx, answeredQueries } = createMockRetryContext({
			callbackData: "otc:retry:",
		});

		const mockService = {
			retry: vi.fn(),
		} as any;

		await handleOtcRetryCallback(ctx, { otcPurchaseService: mockService });

		expect(answeredQueries).toHaveLength(1);
		expect(answeredQueries[0]!.show_alert).toBe(true);
		expect(answeredQueries[0]!.text).toContain("نامعتبر");
		expect(mockService.retry).not.toHaveBeenCalled();
	});

	it("handles DuplicateActiveOtcPurchaseError with user alert", async () => {
		const { ctx, answeredQueries } = createMockRetryContext({
			callbackData: "otc:retry:purchase-abc-123",
		});

		const mockService = {
			retry: vi.fn().mockImplementation(() => {
				throw new DuplicateActiveOtcPurchaseError();
			}),
		} as any;

		await handleOtcRetryCallback(ctx, { otcPurchaseService: mockService });

		expect(answeredQueries).toHaveLength(1);
		expect(answeredQueries[0]!.show_alert).toBe(true);
		expect(answeredQueries[0]!.text).toContain("قبلاً");
	});

	it("handles OtcPurchaseNotFoundError with user alert", async () => {
		const { ctx, answeredQueries } = createMockRetryContext({
			callbackData: "otc:retry:purchase-unknown",
		});

		const mockService = {
			retry: vi.fn().mockImplementation(() => {
				throw new OtcPurchaseNotFoundError();
			}),
		} as any;

		await handleOtcRetryCallback(ctx, { otcPurchaseService: mockService });

		expect(answeredQueries).toHaveLength(1);
		expect(answeredQueries[0]!.show_alert).toBe(true);
		expect(answeredQueries[0]!.text).toContain("یافت نشد");
	});

	it("handles InvalidOtcPurchaseStateError with user alert", async () => {
		const { ctx, answeredQueries } = createMockRetryContext({
			callbackData: "otc:retry:purchase-completed",
		});

		const mockService = {
			retry: vi.fn().mockImplementation(() => {
				throw new InvalidOtcPurchaseStateError("Only FAILED purchases can be retried.");
			}),
		} as any;

		await handleOtcRetryCallback(ctx, { otcPurchaseService: mockService });

		expect(answeredQueries).toHaveLength(1);
		expect(answeredQueries[0]!.show_alert).toBe(true);
		expect(answeredQueries[0]!.text).toContain("قبلاً با موفقیت");
	});
});
