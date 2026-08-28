import { createAppContainer } from '@/core/di/container';
import { TopUpService } from '@/modules/top-up/top-up.service';
import { BuyerService } from '@/modules/buyer/buyer.service';
import { BankAccountService } from '@/modules/bank-account/bank-account.service';
import {
  createTopUpConversation as createTopUpConvNew,
  TOPUP_CONVERSATION_ID,
  type TopUpConversation,
} from '@/modules/top-up/presentation/buyer/top-up.conversation';
import type { DbClient } from '@/core/database/client';
import type { TopUpLimits } from '@/modules/top-up/top-up.limits.vo';

export { TOPUP_CONVERSATION_ID, type TopUpConversation };

export function createTopUpConversation(
  dbClient?: DbClient,
  limitsSource?: TopUpLimits
) {
  const container = createAppContainer({ dbClient, child: true });
  return createTopUpConvNew(
    container.resolve(TopUpService),
    container.resolve(BuyerService),
    container.resolve(BankAccountService),
    limitsSource
  );
}
