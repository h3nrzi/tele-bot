export * from '@/core/shared/currency.utils';
export { TopUpLimits } from '@/modules/top-up/top-up.limits.vo';

import { TopUpLimits } from '@/modules/top-up/top-up.limits.vo';

export function getTopUpLimits(env: NodeJS.ProcessEnv = process.env): TopUpLimits {
  return TopUpLimits.fromEnv(env);
}
