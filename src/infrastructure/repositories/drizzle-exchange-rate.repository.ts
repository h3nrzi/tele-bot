import { DrizzleExchangeRateRepository } from '@/modules/exchange-rate/exchange-rate.repository';

export { DrizzleExchangeRateRepository };
export const exchangeRateRepository = new DrizzleExchangeRateRepository();
