import type { BotContext } from '../../../core/context';
import { REJECT_CONVERSATION_ID } from './reject.conversation';

/**
 * Handles inline Reject button callback queries from Admins by entering the reject conversation.
 */
export async function handleRejectCallback(ctx: BotContext): Promise<void> {
  await ctx.conversation.enter(REJECT_CONVERSATION_ID);
}
