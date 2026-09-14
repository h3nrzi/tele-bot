import { DomainError } from '@/core/shared/domain.error';

export class InvalidOtcPurchaseStateError extends DomainError {
  constructor(message = 'Invalid OTC purchase state transition.') {
    super(message, 'INVALID_OTC_PURCHASE_STATE');
  }
}

export class DuplicateActiveOtcPurchaseError extends DomainError {
  constructor(
    message = 'An active or completed OTC purchase already exists for this top-up request.'
  ) {
    super(message, 'DUPLICATE_ACTIVE_OTC_PURCHASE');
  }
}

export class OtcPurchaseNotFoundError extends DomainError {
  constructor(message = 'OTC purchase not found.') {
    super(message, 'OTC_PURCHASE_NOT_FOUND');
  }
}

