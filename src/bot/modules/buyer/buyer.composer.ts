import { Composer } from 'grammy';
import type { DbClient } from '../../../db/client';
import type { BotContext } from '../../core/context';
import { handleStart } from './start/start.handler';
import { handleBalance } from './balance/balance.handler';
import { handleTopUpCommand } from './top-up/top-up.handler';
import { handlePhotoMessage } from './receipt/receipt.handler';

export interface BuyerComposerOptions {
  dbClient?: DbClient | undefined;
  adminIds?: string | Set<bigint> | undefined;
}

/**
 * Creates a grammY Composer that mounts all Buyer routes:
 * - /start
 * - /balance
 * - /topup
 * - message:photo (receipt upload)
 */
export function createBuyerComposer(options?: BuyerComposerOptions): Composer<BotContext> {
  const composer = new Composer<BotContext>();

  composer.command('start', async (ctx) => {
    await handleStart(ctx, options?.dbClient);
  });

  composer.command('balance', async (ctx) => {
    await handleBalance(ctx, options?.dbClient);
  });

  composer.command('topup', async (ctx) => {
    await handleTopUpCommand(ctx, options?.dbClient, { adminIds: options?.adminIds });
  });

  composer.on('message:photo', async (ctx) => {
    await handlePhotoMessage(ctx, options?.dbClient, { adminIds: options?.adminIds });
  });

  return composer;
}
