import { DrizzleBankAccountRepository } from '@/modules/bank-account/bank-account.repository';

export { DrizzleBankAccountRepository };
export const bankAccountRepository = new DrizzleBankAccountRepository();
