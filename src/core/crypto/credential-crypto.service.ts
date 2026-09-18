import { injectable } from "tsyringe";
import crypto from "node:crypto";
import type { EncryptedCredential, ICredentialCryptoService } from "@/core/crypto/credential-crypto.interface";
import {
	MissingCredentialsEncryptionKeyError,
	InvalidCredentialsEncryptionKeyError,
	CredentialEncryptionError,
	CredentialDecryptionError,
} from "@/core/crypto/credential-crypto.errors";

@injectable()
export class CredentialCryptoService implements ICredentialCryptoService {
	private readonly key: Buffer;

	constructor(key?: string | Buffer) {
		const rawKey = key ?? process.env.CREDENTIALS_ENCRYPTION_KEY;
		this.key = CredentialCryptoService.validateAndParseKey(rawKey);
	}

	public static validateAndParseKey(rawKey?: string | Buffer | null): Buffer {
		if (rawKey === undefined || rawKey === null) {
			throw new MissingCredentialsEncryptionKeyError(
				"CREDENTIALS_ENCRYPTION_KEY environment variable or key parameter is required.",
			);
		}

		if (Buffer.isBuffer(rawKey)) {
			if (rawKey.length !== 32) {
				throw new InvalidCredentialsEncryptionKeyError(
					`CREDENTIALS_ENCRYPTION_KEY buffer must be exactly 32 bytes, got ${rawKey.length} bytes.`,
				);
			}
			return rawKey;
		}

		if (typeof rawKey !== "string") {
			throw new InvalidCredentialsEncryptionKeyError(
				"Invalid CREDENTIALS_ENCRYPTION_KEY: expected a string or Buffer.",
			);
		}

		const trimmed = rawKey.trim();
		if (trimmed.length === 0) {
			throw new MissingCredentialsEncryptionKeyError(
				"CREDENTIALS_ENCRYPTION_KEY environment variable or key parameter is required.",
			);
		}

		// 1. 64-character hex string (32 bytes)
		if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
			return Buffer.from(trimmed, "hex");
		}

		// 2. Base64 string that decodes to 32 bytes (exactly 44 chars)
		if (/^[A-Za-z0-9+/]{43}=$/.test(trimmed) || /^[A-Za-z0-9+/]{44}$/.test(trimmed)) {
			const buf = Buffer.from(trimmed, "base64");
			if (buf.length === 32) {
				return buf;
			}
		}

		throw new InvalidCredentialsEncryptionKeyError(
			"Invalid CREDENTIALS_ENCRYPTION_KEY: must resolve to a 32-byte key (64 hex characters or 44 base64 characters).",
		);
	}

	public encrypt(plaintext: string): EncryptedCredential {
		if (typeof plaintext !== "string") {
			throw new CredentialEncryptionError("Plaintext to encrypt must be a string.");
		}

		// 12-byte IV standard for AES-GCM (NIST SP 800-38D)
		const iv = crypto.randomBytes(12);
		const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
		let ciphertext = cipher.update(plaintext, "utf8", "hex");
		ciphertext += cipher.final("hex");
		const tag = cipher.getAuthTag().toString("hex");

		return {
			ciphertext,
			iv: iv.toString("hex"),
			tag,
		};
	}

	public decrypt(payload: EncryptedCredential): string {
		if (
			!payload ||
			typeof payload.ciphertext !== "string" ||
			typeof payload.iv !== "string" ||
			typeof payload.tag !== "string"
		) {
			throw new CredentialDecryptionError("Invalid encrypted payload: ciphertext, iv, and tag are required strings.");
		}

		try {
			const iv = Buffer.from(payload.iv, "hex");
			const tag = Buffer.from(payload.tag, "hex");
			const decipher = crypto.createDecipheriv("aes-256-gcm", this.key, iv);
			decipher.setAuthTag(tag);
			let decrypted = decipher.update(payload.ciphertext, "hex", "utf8");
			decrypted += decipher.final("utf8");
			return decrypted;
		} catch (error) {
			if (error instanceof CredentialDecryptionError) {
				throw error;
			}
			throw new CredentialDecryptionError("Failed to decrypt credentials: ciphertext tampered or invalid key/tag.", {
				cause: error,
			});
		}
	}
}
