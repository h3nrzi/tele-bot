import { Composer } from 'grammy';
import type { DbClient } from '@/db/client';
import type { BotContext } from '@/bot/core/context';
import { handleStart } from '@/bot/modules/buyer/start/start.handler';
import { handleBalance } from '@/bot/modules/buyer/balance/balance.handler';
import { handleTopUpCommand } from '@/bot/modules/buyer/top-up/top-up.handler';
import { handleCancelCommand } from '@/bot/modules/buyer/cancel/cancel.handler';
import { handleStatusCommand } from '@/bot/modules/buyer/status/status.handler';
import { handlePhotoMessage } from '@/bot/modules/buyer/receipt/receipt.handler';

export interface BuyerComposerOptions {
  dbClient?: DbClient | undefined;
  adminIds?: string | Set<bigint> | undefined;
}

/**
 * Creates a grammY Composer that mounts all Buyer routes & menu handlers:
 * - /start & '🏠 منوی اصلی'
 * - /balance & '💰 موجودی کیف پول'
 * - /topup & '➕ افزایش موجودی'
 * - /cancel & '❌ لغو درخواست'
 * - /status & '📋 پیگیری وضعیت'
 * - message:photo (receipt upload)
 */
export function createBuyerComposer(options?: BuyerComposerOptions): Composer<BotContext> {
  const composer = new Composer<BotContext>();

  // Commands
  composer.command('start', async (ctx) => {
    await handleStart(ctx, options?.dbClient, { adminIds: options?.adminIds });
  });

  composer.command('balance', async (ctx) => {
    await handleBalance(ctx, options?.dbClient);
  });

  composer.command('topup', async (ctx) => {
    await handleTopUpCommand(ctx, options?.dbClient, { adminIds: options?.adminIds });
  });

  composer.command('cancel', async (ctx) => {
    await handleCancelCommand(ctx, options?.dbClient);
  });

  composer.command('status', async (ctx) => {
    await handleStatusCommand(ctx, options?.dbClient);
  });

  // Menu Button Handlers (Hears)
  composer.hears(['💰 موجودی کیف پول', 'موجودی کیف پول', 'موجودی'], async (ctx) => {
    await handleBalance(ctx, options?.dbClient);
  });

  composer.hears(['➕ افزایش موجودی', 'افزایش موجودی', 'شارژ کیف پول'], async (ctx) => {
    await handleTopUpCommand(ctx, options?.dbClient, { adminIds: options?.adminIds });
  });

  composer.hears(['📋 پیگیری وضعیت', 'پیگیری وضعیت', 'وضعیت درخواست'], async (ctx) => {
    await handleStatusCommand(ctx, options?.dbClient);
  });

  composer.hears(['❌ لغو درخواست', 'لغو درخواست'], async (ctx) => {
    await handleCancelCommand(ctx, options?.dbClient);
  });

  composer.hears(['🏠 منوی اصلی', 'منوی اصلی'], async (ctx) => {
    await handleStart(ctx, options?.dbClient, { adminIds: options?.adminIds });
  });

  // Media
  composer.on('message:photo', async (ctx) => {
    await handlePhotoMessage(ctx, options?.dbClient, { adminIds: options?.adminIds });
  });

  return composer;
}
