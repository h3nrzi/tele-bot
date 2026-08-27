import { DomainError } from '@/domain/shared/domain.error';

export class NoActiveBankAccountError extends DomainError {
  constructor(message = 'No active bank account configured.') {
    super(message, 'NO_ACTIVE_BANK_ACCOUNT');
  }
}

export class InvalidCardNumberError extends DomainError {
  constructor(message = 'Card number must be a 16-digit string.') {
    super(message, 'INVALID_CARD_NUMBER');
  }
}

export class InvalidCardHolderNameError extends DomainError {
  constructor(message = 'Card holder name cannot be empty.') {
    super(message, 'INVALID_CARD_HOLDER_NAME');
  }
}

export class InvalidBankNameError extends DomainError {
  constructor(message = 'Bank name cannot be empty.') {
    super(message, 'INVALID_BANK_NAME');
  }
}
