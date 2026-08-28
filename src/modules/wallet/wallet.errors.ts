import { DomainError } from '@/core/shared/domain.error';

export class WalletNotFoundError extends DomainError {
  constructor(message = 'Buyer wallet not found.') {
    super(message, 'WALLET_NOT_FOUND');
  }
}

export class InsufficientBalanceError extends DomainError {
  constructor(message = 'Insufficient wallet balance.') {
    super(message, 'INSUFFICIENT_BALANCE');
  }
}
