import { vi } from 'vitest';
import type { Context } from 'grammy';

export interface MockSender {
  id: number;
  first_name?: string;
  username?: string;
}

export interface MockContextResult {
  ctx: Context;
  repliedMessages: string[];
}

/**
 * Creates a mock grammY Context for testing command handlers.
 */
export function createMockContext(from?: MockSender): MockContextResult {
  const repliedMessages: string[] = [];
  const ctx = {
    from: from
      ? {
          id: from.id,
          is_bot: false,
          first_name: from.first_name ?? '',
          username: from.username,
        }
      : undefined,
    reply: vi.fn(async (text: string) => {
      repliedMessages.push(text);
    }),
  } as unknown as Context;

  return { ctx, repliedMessages };
}
