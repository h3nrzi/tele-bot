import type { BotContext } from '@/core/bot/context';
import { SETCARD_CONVERSATION_ID } from '@/modules/bank-account/presentation/set-card.conversation';

/**
 * Handles the /setcard Admin command by entering the setcard conversation.
 */
export async function handleSetCardCommand(ctx: BotContext): Promise<void> {
  await ctx.conversation.enter(SETCARD_CONVERSATION_ID);
}
