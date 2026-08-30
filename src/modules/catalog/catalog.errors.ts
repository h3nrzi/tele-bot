import { DomainError } from '@/core/shared/domain.error';

export class CatalogItemNotFoundError extends DomainError {
  constructor(message = 'Catalog item was not found.') {
    super(message, 'CATALOG_ITEM_NOT_FOUND');
  }
}

export class InvalidCatalogItemNameError extends DomainError {
  constructor(message = 'Catalog item name cannot be empty.') {
    super(message, 'INVALID_CATALOG_ITEM_NAME');
  }
}

export class InvalidCatalogItemPriceError extends DomainError {
  constructor(message = 'Catalog item price must be a positive USD amount.') {
    super(message, 'INVALID_CATALOG_ITEM_PRICE');
  }
}
