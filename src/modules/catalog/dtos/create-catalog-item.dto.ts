import type Decimal from 'decimal.js';
import type { UsdAmount } from '@/core/shared/money.vo';

export interface CreateCatalogItemInput {
  name: string;
  description?: string | null | undefined;
  usdPrice: string | number | Decimal | UsdAmount;
  isActive?: boolean | undefined;
}
