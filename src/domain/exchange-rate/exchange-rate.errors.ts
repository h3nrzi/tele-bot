import { DomainError } from '@/domain/shared/domain.error';

export class NoExchangeRateError extends DomainError {
  constructor(message = 'No exchange rate has been configured.') {
    super(message, 'NO_EXCHANGE_RATE_CONFIGURED');
  }
}

export class InvalidExchangeRateError extends DomainError {
  constructor(message = 'Exchange rate (irrPerUsd) must be a positive integer.') {
    super(message, 'INVALID_EXCHANGE_RATE');
  }
}
