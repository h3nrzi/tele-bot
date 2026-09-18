import { DomainError } from "@/core/shared/domain.error";

export class MissingCredentialsEncryptionKeyError extends DomainError {
	constructor(message: string = "CREDENTIALS_ENCRYPTION_KEY environment variable or key parameter is required.") {
		super(message);
	}
}

export class InvalidCredentialsEncryptionKeyError extends DomainError {
	constructor(message: string = "Invalid CREDENTIALS_ENCRYPTION_KEY: must resolve to a 32-byte key (hex or base64).") {
		super(message);
	}
}

export class CredentialEncryptionError extends DomainError {
	constructor(message: string = "Failed to encrypt credentials: input must be a string.") {
		super(message, "CREDENTIAL_ENCRYPTION_ERROR");
	}
}

export class CredentialDecryptionError extends DomainError {
	constructor(
		message: string = "Failed to decrypt credentials: ciphertext tampered or invalid key/tag.",
		options?: { cause?: unknown },
	) {
		super(message, "CREDENTIAL_DECRYPTION_ERROR");
		if (options?.cause) {
			this.cause = options.cause;
		}
	}
}
