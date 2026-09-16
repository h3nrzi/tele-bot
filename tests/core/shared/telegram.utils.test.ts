import { describe, it, expect } from "vitest";
import {
	escapeMarkdown,
	isValidUuid,
	isCancelCommand,
	normalizeChatId,
	formatUserDisplayName,
} from "@/core/shared/telegram.utils";

describe("telegram.utils", () => {
	describe("escapeMarkdown", () => {
		it("returns empty string for falsy input", () => {
			expect(escapeMarkdown("")).toBe("");
			expect(escapeMarkdown(undefined as any)).toBe("");
			expect(escapeMarkdown(null as any)).toBe("");
		});

		it("leaves plain text without special characters unchanged", () => {
			expect(escapeMarkdown("hello world")).toBe("hello world");
			expect(escapeMarkdown("سفارش شما تایید شد")).toBe("سفارش شما تایید شد");
			expect(escapeMarkdown("1234567890")).toBe("1234567890");
		});

		it("escapes underscore correctly", () => {
			expect(escapeMarkdown("CANNOT_VERIFY")).toBe("CANNOT\\_VERIFY");
			expect(escapeMarkdown("OUT_OF_STOCK")).toBe("OUT\\_OF\\_STOCK");
			expect(escapeMarkdown("@buyer_user")).toBe("@buyer\\_user");
		});

		it("escapes asterisks correctly", () => {
			expect(escapeMarkdown("bold*text*here")).toBe("bold\\*text\\*here");
		});

		it("escapes backticks and brackets correctly", () => {
			expect(escapeMarkdown("`code` and [link]")).toBe("\\`code\\` and \\[link]");
		});

		it("escapes backslashes correctly", () => {
			expect(escapeMarkdown("foo\\bar")).toBe("foo\\\\bar");
		});

		it("escapes combinations of special characters", () => {
			expect(escapeMarkdown("test_*`[\\hello")).toBe("test\\_\\*\\`\\[\\\\hello");
		});
	});

	describe("normalizeChatId", () => {
		it("converts number to bigint", () => {
			expect(normalizeChatId(12345)).toBe(12345n);
		});

		it("converts string to bigint", () => {
			expect(normalizeChatId("9876543210")).toBe(9876543210n);
		});

		it("preserves bigint", () => {
			expect(normalizeChatId(100n)).toBe(100n);
		});
	});

	describe("isValidUuid", () => {
		it("validates UUID v4 correctly", () => {
			expect(isValidUuid("1a583732-5669-4a21-9aa4-ad441301a047")).toBe(true);
			expect(isValidUuid("invalid-uuid")).toBe(false);
			expect(isValidUuid("")).toBe(false);
		});
	});

	describe("isCancelCommand", () => {
		it("identifies cancel commands correctly", () => {
			expect(isCancelCommand("/cancel")).toBe(true);
			expect(isCancelCommand("cancel")).toBe(true);
			expect(isCancelCommand("انصراف")).toBe(true);
			expect(isCancelCommand("❌ انصراف")).toBe(true);
			expect(isCancelCommand("لغو")).toBe(true);
			expect(isCancelCommand("سلام")).toBe(false);
		});
	});

	describe("formatUserDisplayName", () => {
		it("prefers username with @ prefix when username is present", () => {
			expect(
				formatUserDisplayName({
					id: 12345,
					username: "alice",
					first_name: "Alice",
				}),
			).toBe("@alice");
		});

		it("falls back to first_name when username is absent", () => {
			expect(
				formatUserDisplayName({
					id: 12345,
					first_name: "Bob",
				}),
			).toBe("Bob");
		});

		it("falls back to string id when neither username nor first_name is present", () => {
			expect(
				formatUserDisplayName({
					id: 99887766,
				}),
			).toBe("99887766");
		});
	});
});
