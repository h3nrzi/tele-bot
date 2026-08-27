import { DomainError } from '@/domain/shared/domain.error';

export class BuyerNotFoundError extends DomainError {
  constructor(message = 'Buyer not found.') {
    super(message, 'BUYER_NOT_FOUND');
  }
}

export class BuyerRegistrationError extends DomainError {
  constructor(message = 'Failed to register buyer.') {
    super(message, 'BUYER_REGISTRATION_FAILED');
  }
}
