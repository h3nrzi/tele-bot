import { DomainError } from "@/core/shared/domain.error";

/**
 * Base class for all Wallex exchange integration errors.
 */
export class WallexError extends DomainError {
	constructor(message: string, code = "WALLEX_ERROR") {
		super(message, code);
	}
}

/**
 * Thrown when Wallex rejects authentication (e.g. 401, 403, or invalid API key).
 */
export class WallexAuthError extends WallexError {
	constructor(message = "Wallex API authentication failed. Check WALLEX_API_KEY.") {
		super(message, "WALLEX_AUTH_ERROR");
	}
}

/**
 * Thrown when Wallex rate limits requests (HTTP 429).
 */
export class WallexRateLimitError extends WallexError {
	constructor(message = "Wallex API rate limit exceeded.") {
		super(message, "WALLEX_RATE_LIMIT_ERROR");
	}
}

/**
 * Thrown when Wallex is unavailable or under maintenance (HTTP 503 or maintenance status).
 */
export class WallexMaintenanceError extends WallexError {
	constructor(message = "Wallex API is currently under maintenance.") {
		super(message, "WALLEX_MAINTENANCE_ERROR");
	}
}

/**
 * Thrown when a network-level failure occurs while contacting Wallex.
 */
export class WallexNetworkError extends WallexError {
	constructor(
		message = "Network error communicating with Wallex API.",
		public override readonly cause?: unknown,
	) {
		super(message, "WALLEX_NETWORK_ERROR");
	}
}

/**
 * Thrown when Wallex returns a response that cannot be parsed or is missing required fields.
 */
export class WallexBadResponseError extends WallexError {
	constructor(message = "Received invalid or malformed response from Wallex API.") {
		super(message, "WALLEX_BAD_RESPONSE_ERROR");
	}
}

/**
 * Thrown when Wallex returns an operational API error.
 */
export class WallexApiError extends WallexError {
	constructor(
		message: string,
		public readonly statusCode?: number,
		public readonly responseBody?: unknown,
	) {
		super(message, "WALLEX_API_ERROR");
	}
}
