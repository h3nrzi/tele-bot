import { createAppContainer } from '@/core/di/container';
import { BankAccountService } from '@/modules/bank-account/bank-account.service';
import {
  createSetCardConversation as createSetCardNew,
  SETCARD_CONVERSATION_ID,
  type SetCardConversation,
} from '@/modules/bank-account/presentation/set-card.conversation';
import type { DbClient } from '@/core/database/client';

export { SETCARD_CONVERSATION_ID, type SetCardConversation };

export function createSetCardConversation(dbClient?: DbClient) {
  const container = createAppContainer({ dbClient, child: true });
  return createSetCardNew(container.resolve(BankAccountService));
}
