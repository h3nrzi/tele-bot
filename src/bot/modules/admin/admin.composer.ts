import { Composer } from 'grammy';
import type { DbClient } from '../../../db/client';
import type { BotContext } from '../../core/context';
import { createAdminMiddleware } from '../../core/middleware/admin.middleware';
import { handleSetRate } from './exchange-rate/set-rate.handler';
import { handleRate } from './exchange-rate/rate.handler';
import { handleSetCardCommand } from './bank-account/set-card.handler';
import { handleApproveCallback } from './top-up-approval/approve.handler';

export interface AdminComposerOptions {
  dbClient?: DbClient | undefined;
  adminIds?: string | Set<bigint> | undefined;
}

/**
 * Creates a grammY Composer that mounts and guards all Admin routes:
 * - /setrate
 * - /rate
 * - /setcard
 * - callbackQuery approve:<requestId>
 */
export function createAdminComposer(options?: AdminComposerOptions): Composer<BotContext> {
  const composer = new Composer<BotContext>();
  const adminAuth = createAdminMiddleware<BotContext>({ adminIds: options?.adminIds });

  composer.command('setrate', adminAuth, async (ctx) => {
    await handleSetRate(ctx, options?.dbClient);
  });

  composer.command('rate', adminAuth, async (ctx) => {
    await handleRate(ctx, options?.dbClient);
  });

  composer.command('setcard', adminAuth, async (ctx) => {
    await handleSetCardCommand(ctx);
  });

  composer.callbackQuery(/^approve:(.+)$/, adminAuth, async (ctx) => {
    await handleApproveCallback(ctx, options?.dbClient, {
      adminIds: options?.adminIds,
    });
  });

  return composer;
}
