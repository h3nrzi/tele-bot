import { Composer } from 'grammy';
import type { DependencyContainer } from 'tsyringe';
import type { BotContext } from '@/core/bot/context';
import { createAdminMiddleware } from '@/core/bot/middleware/admin.middleware';
import { handleSetRate } from '@/modules/exchange-rate/presentation/set-rate.handler';
import { handleRate } from '@/modules/exchange-rate/presentation/rate.handler';
import { getSetRatePromptGuideMessage } from '@/modules/exchange-rate/presentation/exchange-rate.messages';
import { handleSetCardCommand } from '@/modules/bank-account/presentation/set-card.handler';
import { handleApproveCallback } from '@/modules/top-up/presentation/admin/approve.handler';
import { handleRejectCallback } from '@/modules/top-up/presentation/admin/reject.handler';
import {
  handlePending,
  handlePendingPage,
  handleReviewCallback,
} from '@/modules/top-up/presentation/admin/pending.handler';
import { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import { BankAccountService } from '@/modules/bank-account/bank-account.service';
import { TopUpService } from '@/modules/top-up/top-up.service';

export interface AdminComposerOptions {
  container?: DependencyContainer | undefined;
  exchangeRateService?: ExchangeRateService | undefined;
  bankAccountService?: BankAccountService | undefined;
  topUpService?: TopUpService | undefined;
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
  const container = options?.container;

  const exchangeRateService =
    options?.exchangeRateService ??
    (container ? container.resolve(ExchangeRateService) : undefined);
  const topUpService =
    options?.topUpService ??
    (container ? container.resolve(TopUpService) : undefined);

  // Admin Commands
  composer.command('setrate', adminAuth, async (ctx) => {
    if (exchangeRateService) {
      await handleSetRate(ctx, exchangeRateService);
    }
  });

  composer.command('rate', adminAuth, async (ctx) => {
    if (exchangeRateService) {
      await handleRate(ctx, exchangeRateService);
    }
  });

  composer.command('setcard', adminAuth, async (ctx) => {
    await handleSetCardCommand(ctx);
  });

  composer.command('pending', adminAuth, async (ctx) => {
    if (topUpService) {
      await handlePending(ctx, topUpService);
    }
  });

  // Admin Menu Button Handlers (Hears)
  composer.hears(['⏳ درخواست‌های در انتظار', 'درخواست‌های در انتظار', 'صف انتظار'], adminAuth, async (ctx) => {
    if (topUpService) {
      await handlePending(ctx, topUpService);
    }
  });

  composer.hears(['💳 تنظیم کارت بانکی', 'تنظیم کارت بانکی', 'تنظیم کارت'], adminAuth, async (ctx) => {
    await handleSetCardCommand(ctx);
  });

  composer.hears(['💱 نرخ ارز فعلی', 'نرخ ارز فعلی', 'نرخ ارز'], adminAuth, async (ctx) => {
    if (exchangeRateService) {
      await handleRate(ctx, exchangeRateService);
    }
  });

  composer.hears(['✏️ تنظیم نرخ ارز', 'تنظیم نرخ ارز'], adminAuth, async (ctx) => {
    await ctx.reply(getSetRatePromptGuideMessage());
  });

  // Admin Callback Queries
  composer.callbackQuery(/^pending_page:(\d+)$/, adminAuth, async (ctx) => {
    if (topUpService) {
      await handlePendingPage(ctx, topUpService);
    }
  });

  composer.callbackQuery(/^review:(.+)$/, adminAuth, async (ctx) => {
    if (topUpService) {
      await handleReviewCallback(ctx, topUpService);
    }
  });

  composer.callbackQuery(/^approve:(.+)$/, adminAuth, async (ctx) => {
    if (topUpService) {
      await handleApproveCallback(ctx, {
        topUpService,
        adminIds: options?.adminIds,
      });
    }
  });

  composer.callbackQuery(/^reject:(.+)$/, adminAuth, async (ctx) => {
    await handleRejectCallback(ctx);
  });

  return composer;
}
