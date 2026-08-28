import { createAppContainer } from '@/core/di/container';
import { BuyerService } from '@/modules/buyer/buyer.service';
import type { RegisterBuyerInput, RegisterBuyerResult } from '@/modules/buyer/dtos/register-buyer.dto';
import type { DbClient } from '@/core/database/client';

export * from '@/modules/buyer/dtos/register-buyer.dto';

export async function registerBuyer(
  input: RegisterBuyerInput,
  dbClient?: DbClient
): Promise<RegisterBuyerResult> {
  const container = createAppContainer({ dbClient, child: true });
  const buyerService = container.resolve(BuyerService);
  return await buyerService.register(input, dbClient);
}
