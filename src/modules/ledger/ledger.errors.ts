import { DomainError } from '@/core/shared/domain.error';

export class LedgerUnbalancedEntriesError extends DomainError {
  constructor(message = 'Ledger entries do not balance between debits and credits.') {
    super(message, 'LEDGER_UNBALANCED_ENTRIES');
  }
}

export class LedgerInsufficientEntriesError extends DomainError {
  constructor(message = 'Ledger transaction must have at least 2 entries.') {
    super(message, 'LEDGER_INSUFFICIENT_ENTRIES');
  }
}
