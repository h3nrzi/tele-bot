import { DrizzleLedgerRepository } from '@/modules/ledger/ledger.repository';

export { DrizzleLedgerRepository };
export const ledgerRepository = new DrizzleLedgerRepository();
