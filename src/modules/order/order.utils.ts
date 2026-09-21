/**
 * Pure utility functions for the Order domain module.
 */

export const REDACTED_PASSWORD_SENTINEL = "[REDACTED]";

/**
 * Redacts sensitive password fields in buyerInputs for terminal order states (FULFILLED, REJECTED, CANCELLED).
 * Preserves non-sensitive operational metadata (email, targetUsername, region, etc.) per ADR-0012.
 *
 * @param buyerInputs The raw buyer inputs stored on the order, if any.
 * @returns A new object with the sensitive password field replaced with "[REDACTED]", or null if input was empty.
 */
export function redactBuyerInputs(
	buyerInputs: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
	if (!buyerInputs || typeof buyerInputs !== "object") {
		return null;
	}

	const redacted: Record<string, unknown> = { ...buyerInputs };

	if ("password" in redacted && redacted.password !== undefined) {
		redacted.password = REDACTED_PASSWORD_SENTINEL;
	}

	return redacted;
}
