import type { BotContext } from '@/bot/context';
import { SETCARD_CONVERSATION_ID } from '@/bot/handlers/admin/set-card.conversation';

/**
 * Handles the /setcard command by entering the setcard conversation.
 */
export async function handleSetCardCommand(ctx: BotContext): Promise<void> {
  await ctx.conversation.enter(SETCARD_CONVERSATION_ID);
}
