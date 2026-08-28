import { Composer } from 'grammy';
import type { DbClient } from '@/db/client';
import type { BotContext } from '@/bot/core/context';
import { createAdminMiddleware } from '@/bot/core/middleware/admin.middleware';
import { handleSetRate } from '@/bot/modules/admin/exchange-rate/set-rate.handler';
import { handleRate } from '@/bot/modules/admin/exchange-rate/rate.handler';
import { getSetRatePromptGuideMessage } from '@/bot/modules/admin/exchange-rate/exchange-rate.messages';
import { handleSetCardCommand } from '@/bot/modules/admin/bank-account/set-card.handler';
import { handleApproveCallback } from '@/bot/modules/admin/top-up-approval/approve.handler';
import { handleRejectCallback } from '@/bot/modules/admin/top-up-rejection/reject.handler';
import {
  handlePending,
  handlePendingPage,
  handleReviewCallback,
} from '@/bot/modules/admin/pending-queue/pending.handler';

export interface AdminComposerOptions {
  dbClient?: DbClient | undefined;
  adminIds?: string | Set<bigint> | undefined;
}

/**
 * Creates a grammY Composer that mounts and guards all Admin routes:
 * - /setrate
 * - /rate & '💱 نرخ ارز فعلی'
 * - /setcard & '💳 تنظیم کارت بانکی'
 * - /pending & '⏳ درخواست‌های در انتظار'
 * - '✏️ تنظیم نرخ ارز' (usage guide)
 * - callbackQuery pending_page:<page>
 * - callbackQuery review:<requestId>
 * - callbackQuery approve:<requestId>
 * - callbackQuery reject:<requestId>
 */
export function createAdminComposer(options?: AdminComposerOptions): Composer<BotContext> {
  const composer = new Composer<BotContext>();
  const adminAuth = createAdminMiddleware<BotContext>({ adminIds: options?.adminIds });

  // Admin Commands
  composer.command('setrate', adminAuth, async (ctx) => {
    await handleSetRate(ctx, options?.dbClient);
  });

  composer.command('rate', adminAuth, async (ctx) => {
    await handleRate(ctx, options?.dbClient);
  });

  composer.command('setcard', adminAuth, async (ctx) => {
    await handleSetCardCommand(ctx);
  });

  composer.command('pending', adminAuth, async (ctx) => {
    await handlePending(ctx, options?.dbClient);
  });

  // Admin Menu Button Handlers (Hears)
  composer.hears(['⏳ درخواست‌های در انتظار', 'درخواست‌های در انتظار', 'صف انتظار'], adminAuth, async (ctx) => {
    await handlePending(ctx, options?.dbClient);
  });

  composer.hears(['💳 تنظیم کارت بانکی', 'تنظیم کارت بانکی', 'تنظیم کارت'], adminAuth, async (ctx) => {
    await handleSetCardCommand(ctx);
  });

  composer.hears(['💱 نرخ ارز فعلی', 'نرخ ارز فعلی', 'نرخ ارز'], adminAuth, async (ctx) => {
    await handleRate(ctx, options?.dbClient);
  });

  composer.hears(['✏️ تنظیم نرخ ارز', 'تنظیم نرخ ارز'], adminAuth, async (ctx) => {
    await ctx.reply(getSetRatePromptGuideMessage());
  });

  // Admin Callback Queries
  composer.callbackQuery(/^pending_page:(\d+)$/, adminAuth, async (ctx) => {
    await handlePendingPage(ctx, options?.dbClient);
  });

  composer.callbackQuery(/^review:(.+)$/, adminAuth, async (ctx) => {
    await handleReviewCallback(ctx, options?.dbClient);
  });

  composer.callbackQuery(/^approve:(.+)$/, adminAuth, async (ctx) => {
    await handleApproveCallback(ctx, options?.dbClient, {
      adminIds: options?.adminIds,
    });
  });

  composer.callbackQuery(/^reject:(.+)$/, adminAuth, async (ctx) => {
    await handleRejectCallback(ctx);
  });

  return composer;
}
