import type { BotContext } from '@/bot/core/context';
import { SETCARD_CONVERSATION_ID } from '@/bot/modules/admin/bank-account/set-card.conversation';

/**
 * Handles the /setcard Admin command by entering the setcard conversation.
 */
export async function handleSetCardCommand(ctx: BotContext): Promise<void> {
  await ctx.conversation.enter(SETCARD_CONVERSATION_ID);
}
