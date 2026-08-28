import type { Context, MiddlewareFn, NextFunction } from 'grammy';
import { normalizeChatId } from '@/core/shared/telegram.utils';

export interface CreateAdminMiddlewareOptions {
  adminIds?: string | Set<bigint> | undefined;
}

/**
 * Parses a comma-separated string of Telegram chat IDs into a Set of bigints.
 */
export function parseAdminIds(adminIdsStr?: string): Set<bigint> {
  const result = new Set<bigint>();
  if (!adminIdsStr) {
    return result;
  }

  const tokens = adminIdsStr.split(',');
  for (const token of tokens) {
    const trimmed = token.trim();
    if (!trimmed) {
      continue;
    }
    if (/^-?\d+$/.test(trimmed)) {
      result.add(BigInt(trimmed));
    }
  }

  return result;
}

/**
 * Resolves a Set of admin chat IDs from either an explicit option or the ADMIN_IDS environment variable.
 */
export function resolveAdminIds(source?: string | Set<bigint> | undefined): Set<bigint> {
  if (source instanceof Set) {
    return new Set(source);
  }
  return parseAdminIds(typeof source === 'string' ? source : process.env.ADMIN_IDS);
}

/**
 * Checks if a given Telegram chat ID belongs to an Admin.
 * Does not perform any database query.
 */
export function isAdmin(
  chatId: bigint | number | null | undefined,
  adminIdsSource?: string | Set<bigint>
): boolean {
  if (chatId === null || chatId === undefined) {
    return false;
  }

  const normalizedId = normalizeChatId(chatId);
  return resolveAdminIds(adminIdsSource).has(normalizedId);
}

/**
 * Creates a grammY middleware that silently drops any update from a non-Admin sender.
 * No database read is performed for this check.
 */
export function createAdminMiddleware<C extends Context = Context>(
  options?: CreateAdminMiddlewareOptions
): MiddlewareFn<C> {
  return async (ctx: C, next: NextFunction): Promise<void> => {
    const senderId = ctx.from?.id;
    if (senderId === undefined || senderId === null) {
      return;
    }

    const isAuthorized = isAdmin(senderId, options?.adminIds);
    if (!isAuthorized) {
      return;
    }

    await next();
  };
}

/**
 * Default Admin middleware reading from the ADMIN_IDS environment variable.
 * Silently drops any update from a non-Admin sender before it reaches an Admin handler.
 */
export const adminMiddleware = createAdminMiddleware();
