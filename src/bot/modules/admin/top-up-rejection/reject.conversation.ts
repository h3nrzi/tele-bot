import { createAppContainer } from '@/core/di/container';
import { TopUpService } from '@/modules/top-up/top-up.service';
import {
  createRejectConversation as createRejectNew,
  REJECT_CONVERSATION_ID,
  type RejectConversation,
} from '@/modules/top-up/presentation/admin/reject.conversation';
import type { DbClient } from '@/core/database/client';

export { REJECT_CONVERSATION_ID, type RejectConversation };

export function createRejectConversation(dbClient?: DbClient) {
  const container = createAppContainer({ dbClient, child: true });
  return createRejectNew(container.resolve(TopUpService));
}
