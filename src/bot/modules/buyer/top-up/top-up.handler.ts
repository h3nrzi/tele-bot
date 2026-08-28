import type { BotContext } from '@/core/bot/context';
import type { DbClient } from '@/core/database/client';
import { createAppContainer } from '@/core/di/container';
import { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import { BankAccountService } from '@/modules/bank-account/bank-account.service';
import { BuyerService } from '@/modules/buyer/buyer.service';
import { TopUpService } from '@/modules/top-up/top-up.service';
import { handleTopUpCommand as handleTopUpNew } from '@/modules/top-up/presentation/buyer/top-up.handler';

export async function handleTopUpCommand(
  ctx: BotContext,
  dbClient?: DbClient,
  options?: { adminIds?: string | Set<bigint> | undefined }
): Promise<void> {
  const container = createAppContainer({ dbClient, child: true });
  return await handleTopUpNew(ctx, {
    exchangeRateService: container.resolve(ExchangeRateService),
    bankAccountService: container.resolve(BankAccountService),
    buyerService: container.resolve(BuyerService),
    topUpService: container.resolve(TopUpService),
    adminIds: options?.adminIds,
  });
}
