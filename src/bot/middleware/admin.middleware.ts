import type { Context, MiddlewareFn } from 'grammy';
import { normalizeChatId } from '@/core/shared/telegram.utils';

export function parseAdminIds(rawIds?: string): Set<bigint> {
  const ids = new Set<bigint>();
  const source = rawIds ?? '';

  if (!source.trim()) {
    return ids;
  }

  const parts = source.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    try {
      ids.add(BigInt(trimmed));
    } catch {
      // Ignore unparseable tokens
    }
  }

  return ids;
}

export function resolveAdminIds(adminIds?: string | Set<bigint>): Set<bigint> {
  if (adminIds instanceof Set) {
    return adminIds;
  }
  return parseAdminIds(adminIds ?? process.env.ADMIN_IDS ?? '');
}

export function isAdmin(
  telegramChatId: bigint | number | null | undefined,
  adminIdsSource?: string | Set<bigint>
): boolean {
  if (telegramChatId === undefined || telegramChatId === null) {
    return false;
  }
  const idBigInt = normalizeChatId(telegramChatId);
  const adminIds = resolveAdminIds(adminIdsSource);
  return adminIds.has(idBigInt);
}

export interface AdminMiddlewareOptions {
  adminIds?: string | Set<bigint> | undefined;
}

export function createAdminMiddleware<C extends Context>(
  options?: AdminMiddlewareOptions
): MiddlewareFn<C> {
  return async (ctx, next) => {
    const senderId = ctx.from?.id;
    if (!isAdmin(senderId, options?.adminIds)) {
      return;
    }
    return await next();
  };
}

export const adminMiddleware = createAdminMiddleware();
