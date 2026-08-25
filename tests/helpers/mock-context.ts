import { vi } from 'vitest';
import type { Context } from 'grammy';

export interface MockSender {
  id: number;
  first_name?: string;
  username?: string;
}

export interface CreateMockContextOptions {
  match?: string;
  text?: string;
}

export interface MockContextResult {
  ctx: Context;
  repliedMessages: string[];
}

/**
 * Creates a mock grammY Context for testing command handlers.
 */
export function createMockContext(
  from?: MockSender,
  options?: CreateMockContextOptions
): MockContextResult {
  const repliedMessages: string[] = [];
  const fromUser = from
    ? {
        id: from.id,
        is_bot: false,
        first_name: from.first_name ?? '',
        username: from.username,
      }
    : undefined;

  const ctx = {
    from: fromUser,
    match: options?.match,
    message: options?.text
      ? {
          message_id: 1,
          date: Math.floor(Date.now() / 1000),
          chat: { id: from?.id ?? 1, type: 'private' },
          from: fromUser,
          text: options.text,
        }
      : undefined,
    reply: vi.fn(async (text: string) => {
      repliedMessages.push(text);
    }),
  } as unknown as Context;

  return { ctx, repliedMessages };
}

/**
 * Intercepts outbound sendMessage API calls on a grammY Bot instance and collects sent message texts into an array.
 */
export function captureBotReplies(bot: { api: { config: { use: Function } } }): string[] {
  const repliedMessages: string[] = [];
  bot.api.config.use(async (prev: any, method: string, payload: any, signal: any) => {
    if (method === 'sendMessage') {
      repliedMessages.push(payload.text);
      return {
        ok: true,
        result: {
          message_id: 1,
          date: Date.now(),
          chat: { id: payload.chat_id, type: 'private' },
          text: payload.text,
        },
      } as any;
    }
    return prev(method, payload, signal);
  });
  return repliedMessages;
}

