import type Decimal from 'decimal.js';
import type { UsdAmount } from '@/core/shared/money.vo';

export interface EditCatalogItemInput {
  name?: string | undefined;
  description?: string | null | undefined;
  usdPrice?: string | number | Decimal | UsdAmount | undefined;
  isActive?: boolean | undefined;
}
