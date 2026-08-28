import type { Context } from 'grammy';
import type { Conversation, ConversationFlavor } from '@grammyjs/conversations';

/**
 * Enhanced grammY Context type supporting conversation plugins.
 */
export type BotContext = ConversationFlavor<Context>;

/**
 * Generic bot conversation type.
 */
export type BotConversation = Conversation<BotContext, Context>;
