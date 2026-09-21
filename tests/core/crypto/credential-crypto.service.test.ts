import "reflect-metadata";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
	CredentialCryptoService,
	MissingCredentialsEncryptionKeyError,
	InvalidCredentialsEncryptionKeyError,
	CredentialEncryptionError,
	CredentialDecryptionError,
} from "@/core/crypto";

describe("CredentialCryptoService", () => {
	const validHexKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"; // 32 bytes
	const validBase64Key = Buffer.from("0123456789abcdef0123456789abcdef", "utf-8").toString("base64"); // 32 bytes in base64
	const invalidRawString = "12345678901234567890123456789012"; // 32 chars, not 64 hex or base64

	const originalEnv = process.env.CREDENTIALS_ENCRYPTION_KEY;

	beforeEach(() => {
		delete process.env.CREDENTIALS_ENCRYPTION_KEY;
	});

	afterEach(() => {
		if (originalEnv !== undefined) {
			process.env.CREDENTIALS_ENCRYPTION_KEY = originalEnv;
		} else {
			delete process.env.CREDENTIALS_ENCRYPTION_KEY;
		}
	});

	describe("Key Validation and Initialization", () => {
		it("initializes successfully with a 64-character hex key passed in constructor", () => {
			const service = new CredentialCryptoService(validHexKey);
			expect(service).toBeDefined();
		});

		it("initializes successfully with a 32-byte base64 key passed in constructor", () => {
			const service = new CredentialCryptoService(validBase64Key);
			expect(service).toBeDefined();
		});

		it("throws InvalidCredentialsEncryptionKeyError for a raw 32-character string that is not valid 64-char hex or base64", () => {
			expect(() => new CredentialCryptoService(invalidRawString)).toThrow(
				InvalidCredentialsEncryptionKeyError,
			);
		});

		it("initializes successfully with a 32-byte Buffer", () => {
			const bufferKey = Buffer.alloc(32, 0x42);
			const service = new CredentialCryptoService(bufferKey);
			expect(service).toBeDefined();
		});

		it("reads CREDENTIALS_ENCRYPTION_KEY from process.env if not provided in constructor", () => {
			process.env.CREDENTIALS_ENCRYPTION_KEY = validHexKey;
			const service = new CredentialCryptoService();
			expect(service).toBeDefined();
		});

		it("throws MissingCredentialsEncryptionKeyError if no key is provided and env var is missing", () => {
			delete process.env.CREDENTIALS_ENCRYPTION_KEY;
			expect(() => new CredentialCryptoService()).toThrow(MissingCredentialsEncryptionKeyError);
		});

		it("throws MissingCredentialsEncryptionKeyError if env var is empty string or whitespace", () => {
			process.env.CREDENTIALS_ENCRYPTION_KEY = "   ";
			expect(() => new CredentialCryptoService()).toThrow(MissingCredentialsEncryptionKeyError);
		});

		it("throws InvalidCredentialsEncryptionKeyError if key is too short or invalid length", () => {
			expect(() => new CredentialCryptoService("too-short")).toThrow(InvalidCredentialsEncryptionKeyError);
			expect(() => new CredentialCryptoService("0123456789abcdef")).toThrow(InvalidCredentialsEncryptionKeyError);
		});

		it("throws InvalidCredentialsEncryptionKeyError if Buffer is not 32 bytes", () => {
			expect(() => new CredentialCryptoService(Buffer.alloc(16))).toThrow(InvalidCredentialsEncryptionKeyError);
		});
	});

	describe("Encryption and Decryption", () => {
		it("encrypts and decrypts standard plaintext strings round-trip", () => {
			const service = new CredentialCryptoService(validHexKey);
			const plaintext = "MySecretPassword123!@#";

			const encrypted = service.encrypt(plaintext);

			expect(encrypted).toHaveProperty("ciphertext");
			expect(encrypted).toHaveProperty("iv");
			expect(encrypted).toHaveProperty("tag");
			expect(typeof encrypted.ciphertext).toBe("string");
			expect(typeof encrypted.iv).toBe("string");
			expect(typeof encrypted.tag).toBe("string");
			expect(encrypted.ciphertext).not.toEqual(plaintext);

			const decrypted = service.decrypt(encrypted);
			expect(decrypted).toBe(plaintext);
		});

		it("encrypts and decrypts Unicode, Persian text, and emojis round-trip", () => {
			const service = new CredentialCryptoService(validHexKey);
			const plaintext = "رمز عبور بسیار محرمانه 🔒🔑 123456";

			const encrypted = service.encrypt(plaintext);
			const decrypted = service.decrypt(encrypted);

			expect(decrypted).toBe(plaintext);
		});

		it("encrypts and decrypts an empty string", () => {
			const service = new CredentialCryptoService(validHexKey);
			const plaintext = "";

			const encrypted = service.encrypt(plaintext);
			const decrypted = service.decrypt(encrypted);

			expect(decrypted).toBe(plaintext);
		});

		it("generates a distinct IV and ciphertext for identical plaintexts (indistinguishability under CPA)", () => {
			const service = new CredentialCryptoService(validHexKey);
			const plaintext = "ConstantSecretPassword";

			const enc1 = service.encrypt(plaintext);
			const enc2 = service.encrypt(plaintext);

			expect(enc1.iv).not.toEqual(enc2.iv);
			expect(enc1.ciphertext).not.toEqual(enc2.ciphertext);
			expect(service.decrypt(enc1)).toBe(plaintext);
			expect(service.decrypt(enc2)).toBe(plaintext);
		});

		it("throws CredentialEncryptionError when non-string plaintext is passed to encrypt", () => {
			const service = new CredentialCryptoService(validHexKey);
			// @ts-expect-error Testing invalid runtime input
			expect(() => service.encrypt(12345)).toThrow(CredentialEncryptionError);
		});
	});

	describe("Tamper Resistance and Authentication", () => {
		it("throws CredentialDecryptionError when ciphertext has been tampered with", () => {
			const service = new CredentialCryptoService(validHexKey);
			const encrypted = service.encrypt("SensitivePassword");

			// Flip the last character of ciphertext
			const lastChar = encrypted.ciphertext.slice(-1);
			const flippedChar = lastChar === "a" ? "b" : "a";
			const tamperedCiphertext = encrypted.ciphertext.slice(0, -1) + flippedChar;

			expect(() => {
				service.decrypt({
					...encrypted,
					ciphertext: tamperedCiphertext,
				});
			}).toThrow(CredentialDecryptionError);
		});

		it("throws CredentialDecryptionError when tag has been tampered with", () => {
			const service = new CredentialCryptoService(validHexKey);
			const encrypted = service.encrypt("SensitivePassword");

			const lastChar = encrypted.tag.slice(-1);
			const flippedChar = lastChar === "a" ? "b" : "a";
			const tamperedTag = encrypted.tag.slice(0, -1) + flippedChar;

			expect(() => {
				service.decrypt({
					...encrypted,
					tag: tamperedTag,
				});
			}).toThrow(CredentialDecryptionError);
		});

		it("throws CredentialDecryptionError when IV has been tampered with", () => {
			const service = new CredentialCryptoService(validHexKey);
			const encrypted = service.encrypt("SensitivePassword");

			const lastChar = encrypted.iv.slice(-1);
			const flippedChar = lastChar === "a" ? "b" : "a";
			const tamperedIv = encrypted.iv.slice(0, -1) + flippedChar;

			expect(() => {
				service.decrypt({
					...encrypted,
					iv: tamperedIv,
				});
			}).toThrow(CredentialDecryptionError);
		});

		it("throws CredentialDecryptionError when attempting decryption with a different valid key", () => {
			const service1 = new CredentialCryptoService(validHexKey);
			const differentKey = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
			const service2 = new CredentialCryptoService(differentKey);

			const encrypted = service1.encrypt("SensitivePassword");

			expect(() => {
				service2.decrypt(encrypted);
			}).toThrow(CredentialDecryptionError);
		});
	});
});
