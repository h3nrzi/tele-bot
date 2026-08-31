import { DomainError } from '@/core/shared/domain.error';

export class OrderNotFoundError extends DomainError {
  constructor(message = 'Order was not found.') {
    super(message, 'ORDER_NOT_FOUND');
  }
}

export class InsufficientBalanceForOrderError extends DomainError {
  constructor(
    message = 'Insufficient available balance in buyer wallet to place this order.'
  ) {
    super(message, 'INSUFFICIENT_BALANCE_FOR_ORDER');
  }
}

export class CatalogItemUnavailableError extends DomainError {
  constructor(
    message = 'The requested catalog item is not available or has been deactivated.'
  ) {
    super(message, 'CATALOG_ITEM_UNAVAILABLE');
  }
}

export class OrderAlreadyClaimedError extends DomainError {
  constructor(
    message = 'This order has already been claimed by another admin or is no longer in PLACED status.'
  ) {
    super(message, 'ORDER_ALREADY_CLAIMED');
  }
}

export class InvalidOrderStatusError extends DomainError {
  constructor(message = 'Order status does not allow this operation.') {
    super(message, 'INVALID_ORDER_STATUS');
  }
}
