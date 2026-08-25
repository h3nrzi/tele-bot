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

