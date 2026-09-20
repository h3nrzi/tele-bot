import { describe, it, expect } from "vitest";
import { redactBuyerInputs } from "@/modules/order/order.utils";

describe("redactBuyerInputs", () => {
	it("returns null when buyerInputs is null, undefined, or not an object", () => {
		expect(redactBuyerInputs(null)).toBeNull();
		expect(redactBuyerInputs(undefined)).toBeNull();
		expect(redactBuyerInputs("string" as any)).toBeNull();
	});

	it("returns shallow copy unchanged when no password field is present", () => {
		const inputs = {
			targetUsername: "@telegram_user",
			region: "de",
		};

		const result = redactBuyerInputs(inputs);
		expect(result).toEqual(inputs);
		expect(result).not.toBe(inputs);
	});

	it("redacts encrypted password object to [REDACTED] and preserves other fields", () => {
		const inputs = {
			email: "buyer@example.com",
			password: {
				ciphertext: "a1b2c3d4e5f6",
				iv: "1234567890ab",
				tag: "fedcba987654",
			},
			targetUsername: "@buyer",
			region: "fi",
		};

		const result = redactBuyerInputs(inputs);

		expect(result).toEqual({
			email: "buyer@example.com",
			password: "[REDACTED]",
			targetUsername: "@buyer",
			region: "fi",
		});
	});

	it("redacts plaintext password string to [REDACTED]", () => {
		const inputs = {
			email: "test@domain.com",
			password: "SuperSecretPassword123!",
		};

		const result = redactBuyerInputs(inputs);

		expect(result).toEqual({
			email: "test@domain.com",
			password: "[REDACTED]",
		});
	});

	it("is idempotent when password is already [REDACTED]", () => {
		const inputs = {
			email: "test@domain.com",
			password: "[REDACTED]",
		};

		const result = redactBuyerInputs(inputs);

		expect(result).toEqual({
			email: "test@domain.com",
			password: "[REDACTED]",
		});
	});
});
