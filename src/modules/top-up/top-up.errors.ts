import { DomainError } from '@/core/shared/domain.error';

export class ActiveTopUpRequestExistsError extends DomainError {
  constructor(message = 'You already have an active top-up request.') {
    super(message, 'ACTIVE_TOP_UP_REQUEST_EXISTS');
  }
}

export class InvalidTopUpAmountError extends DomainError {
  constructor(message = 'Invalid top-up amount.') {
    super(message, 'INVALID_TOP_UP_AMOUNT');
  }
}

export class NoInitiatedTopUpRequestError extends DomainError {
  constructor(message = 'No active initiated top-up request found.') {
    super(message, 'NO_INITIATED_TOP_UP_REQUEST');
  }
}

export class TopUpRequestExpiredError extends DomainError {
  constructor(message = 'The top-up request has expired.') {
    super(message, 'TOP_UP_REQUEST_EXPIRED');
  }
}

export class TopUpRequestNotFoundError extends DomainError {
  constructor(message = 'Top-up request not found.') {
    super(message, 'TOP_UP_REQUEST_NOT_FOUND');
  }
}

export class TopUpRequestNotPendingError extends DomainError {
  constructor(
    message = 'Top-up request is not pending approval or has already been processed.'
  ) {
    super(message, 'TOP_UP_REQUEST_NOT_PENDING');
  }
}

export class CannotCancelPendingTopUpError extends DomainError {
  constructor(
    message = 'Cannot cancel top-up request after receipt has been submitted.'
  ) {
    super(message, 'CANNOT_CANCEL_PENDING_TOP_UP');
  }
}

export class NoActiveTopUpRequestError extends DomainError {
  constructor(message = 'No active top-up request found.') {
    super(message, 'NO_ACTIVE_TOP_UP_REQUEST');
  }
}
