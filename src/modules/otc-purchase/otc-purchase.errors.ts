import { DomainError } from '@/core/shared/domain.error';

export class InvalidOtcPurchaseStateError extends DomainError {
  constructor(message = 'Invalid OTC purchase state transition.') {
    super(message, 'INVALID_OTC_PURCHASE_STATE');
  }
}
