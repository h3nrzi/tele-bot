/**
 * Encrypted credential payload structure.
 * Stored in orders.buyer_inputs for sensitive account credentials.
 */
export interface EncryptedCredential {
	ciphertext: string;
	iv: string;
	tag: string;
}

/**
 * Domain Service Interface for Credential Cryptography.
 */
export interface ICredentialCryptoService {
	encrypt(plaintext: string): EncryptedCredential;
	decrypt(payload: EncryptedCredential): string;
}
