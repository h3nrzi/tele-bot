import { createAppContainer } from '@/core/di/container';
import { BankAccountService } from '@/modules/bank-account/bank-account.service';
import type { SetActiveAccountInput } from '@/modules/bank-account/dtos/set-active-account.dto';
import type { BankAccount } from '@/modules/bank-account/bank-account.entity';
import type { DbClient } from '@/core/database/client';

export async function setActiveAccount(
  input: SetActiveAccountInput,
  dbClient?: DbClient
): Promise<BankAccount> {
  const container = createAppContainer({ dbClient, child: true });
  const service = container.resolve(BankAccountService);
  return await service.setActiveAccount(input, dbClient);
}

export async function getActiveAccount(
  dbClient?: DbClient
): Promise<BankAccount | null> {
  const container = createAppContainer({ dbClient, child: true });
  const service = container.resolve(BankAccountService);
  return await service.getActiveAccount(dbClient);
}
