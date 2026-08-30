import { Composer } from 'grammy';
import type { DependencyContainer } from 'tsyringe';
import type { BotContext } from '@/bot/context';
import { createAdminMiddleware } from '@/bot/middleware/admin.middleware';
import { handleSetRate } from '@/bot/handlers/admin/set-rate.handler';
import { handleRate } from '@/bot/handlers/admin/rate.handler';
import { handleSetCardCommand } from '@/bot/handlers/admin/set-card.handler';
import { handleApproveCallback } from '@/bot/handlers/admin/approve.handler';
import { handleRejectCallback } from '@/bot/handlers/admin/reject.handler';
import {
  handlePending,
  handlePendingPage,
  handleReviewCallback,
} from '@/bot/handlers/admin/pending.handler';
import {
  handleCatalogCommand,
  handleCatalogToggleCallback,
  handleCatalogAddCallback,
  handleCatalogEditCallback,
} from '@/bot/handlers/admin/catalog.handler';
import { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import { TopUpService } from '@/modules/top-up/top-up.service';
import { CatalogService } from '@/modules/catalog/catalog.service';

export interface AdminComposerOptions {
  container?: DependencyContainer | undefined;
  exchangeRateService?: ExchangeRateService | undefined;
  topUpService?: TopUpService | undefined;
  catalogService?: CatalogService | undefined;
  adminIds?: string | Set<bigint> | undefined;
}

/**
 * Creates a grammY Composer that mounts and guards all Admin routes:
 * - /setrate
 * - /rate & '💱 نرخ ارز فعلی'
 * - /setcard & '💳 تنظیم کارت بانکی'
 * - /pending & '⏳ درخواست‌های در انتظار'
 * - /catalog & '📦 کاتالوگ خدمات'
 * - '✏️ تنظیم نرخ ارز' (usage guide)
 * - callbackQuery pending_page:<page>
 * - callbackQuery review:<requestId>
 * - callbackQuery approve:<requestId>
 * - callbackQuery reject:<requestId>
 * - callbackQuery catalog:toggle:<itemId>
 * - callbackQuery catalog:add
 * - callbackQuery catalog:edit:<itemId>
 */
export function createAdminComposer(options?: AdminComposerOptions): Composer<BotContext> {
  const composer = new Composer<BotContext>();
  const adminAuth = createAdminMiddleware<BotContext>({ adminIds: options?.adminIds });
  const container = options?.container;

  const exchangeRateService =
    options?.exchangeRateService ?? container?.resolve(ExchangeRateService);
  const topUpService =
    options?.topUpService ?? container?.resolve(TopUpService);
  const catalogService =
    options?.catalogService ?? container?.resolve(CatalogService);

  if (!exchangeRateService || !topUpService || !catalogService) {
    throw new Error('All required services or a container must be provided to createAdminComposer');
  }

  // Admin Commands
  composer.command('catalog', async (ctx) => {
    await handleCatalogCommand(ctx, catalogService, { adminIds: options?.adminIds });
  });

  composer.command('setrate', adminAuth, async (ctx) => {
    await handleSetRate(ctx, exchangeRateService);
  });

  composer.command('rate', adminAuth, async (ctx) => {
    await handleRate(ctx, exchangeRateService);
  });

  composer.command('setcard', adminAuth, async (ctx) => {
    await handleSetCardCommand(ctx);
  });

  composer.command('pending', adminAuth, async (ctx) => {
    await handlePending(ctx, topUpService);
  });

  // Admin Menu Button Handlers (Hears)
  composer.hears(
    ['📦 کاتالوگ خدمات', 'کاتالوگ خدمات', 'مدیریت خدمات', 'کاتالوگ'],
    async (ctx) => {
      await handleCatalogCommand(ctx, catalogService, { adminIds: options?.adminIds });
    }
  );

  composer.hears(['⏳ درخواست‌های در انتظار', 'درخواست‌های در انتظار', 'صف انتظار'], adminAuth, async (ctx) => {
    await handlePending(ctx, topUpService);
  });

  composer.hears(['💳 تنظیم کارت بانکی', 'تنظیم کارت بانکی', 'تنظیم کارت'], adminAuth, async (ctx) => {
    await handleSetCardCommand(ctx);
  });

  composer.hears(['💱 نرخ ارز فعلی', 'نرخ ارز فعلی', 'نرخ ارز'], adminAuth, async (ctx) => {
    await handleRate(ctx, exchangeRateService);
  });

  composer.hears(['✏️ تنظیم نرخ ارز', 'تنظیم نرخ ارز'], adminAuth, async (ctx) => {
    await ctx.reply(
      `برای تنظیم نرخ ارز، لطفاً مقدار ریالی هر دلار را به همراه دستور /setrate ارسال کنید.\n` +
      `مثال: /setrate 620000`
    );
  });

  // Admin Callback Queries
  composer.callbackQuery(/^pending_page:(\d+)$/, adminAuth, async (ctx) => {
    await handlePendingPage(ctx, topUpService);
  });

  composer.callbackQuery(/^review:(.+)$/, adminAuth, async (ctx) => {
    await handleReviewCallback(ctx, topUpService);
  });

  composer.callbackQuery(/^approve:(.+)$/, adminAuth, async (ctx) => {
    await handleApproveCallback(ctx, {
      topUpService,
      adminIds: options?.adminIds,
    });
  });

  composer.callbackQuery(/^reject:(.+)$/, adminAuth, async (ctx) => {
    await handleRejectCallback(ctx);
  });

  composer.callbackQuery(/^catalog:toggle:(.+)$/, adminAuth, async (ctx) => {
    await handleCatalogToggleCallback(ctx, catalogService);
  });

  composer.callbackQuery('catalog:add', adminAuth, async (ctx) => {
    await handleCatalogAddCallback(ctx);
  });

  composer.callbackQuery(/^catalog:edit:(.+)$/, adminAuth, async (ctx) => {
    await handleCatalogEditCallback(ctx);
  });

  return composer;
}
