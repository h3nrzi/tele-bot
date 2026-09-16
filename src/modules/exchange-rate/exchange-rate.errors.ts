import { DomainError } from "@/core/shared/domain.error";

export class NoExchangeRateError extends DomainError {
	constructor(message = "No exchange rate has been configured.") {
		super(message, "NO_EXCHANGE_RATE_CONFIGURED");
	}
}

export class InvalidExchangeRateError extends DomainError {
	constructor(message = "Exchange rate (irrPerUsd) must be a positive integer.") {
		super(message, "INVALID_EXCHANGE_RATE");
	}
}

export class InvalidSpreadError extends DomainError {
	constructor(message = "Spread percentage must be a number between 0 and 10.") {
		super(message, "INVALID_SPREAD");
	}
}

export class InvalidSyncIntervalError extends DomainError {
	constructor(message = "Sync interval must be a positive integer in minutes.") {
		super(message, "INVALID_SYNC_INTERVAL");
	}
}

export class InvalidRateModeError extends DomainError {
	constructor(message = "Rate mode must be either 'MANUAL' or 'AUTO_SYNC'.") {
		super(message, "INVALID_RATE_MODE");
	}
}
