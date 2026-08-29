import { Composer } from 'grammy';
import type { DependencyContainer } from 'tsyringe';
import type { BotContext } from '@/bot/context';
import { handleStart } from '@/bot/handlers/buyer/start.handler';
import { handleBalance } from '@/bot/handlers/buyer/balance.handler';
import { handleTopUpCommand } from '@/bot/handlers/buyer/top-up.handler';
import { handleCancelCommand } from '@/bot/handlers/buyer/cancel.handler';
import { handleStatusCommand } from '@/bot/handlers/buyer/status.handler';
import { handlePhotoMessage } from '@/bot/handlers/buyer/receipt.handler';
import { BuyerService } from '@/modules/buyer/buyer.service';
import { WalletService } from '@/modules/wallet/wallet.service';
import { TopUpService } from '@/modules/top-up/top-up.service';
import { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import { BankAccountService } from '@/modules/bank-account/bank-account.service';

export interface BuyerComposerOptions {
  container?: DependencyContainer | undefined;
  buyerService?: BuyerService | undefined;
  walletService?: WalletService | undefined;
  topUpService?: TopUpService | undefined;
  exchangeRateService?: ExchangeRateService | undefined;
  bankAccountService?: BankAccountService | undefined;
  adminIds?: string | Set<bigint> | undefined;
}

/**
 * Creates a grammY Composer that mounts all Buyer routes & menu handlers.
 */
export function createBuyerComposer(options?: BuyerComposerOptions): Composer<BotContext> {
  const composer = new Composer<BotContext>();
  const container = options?.container;

  const buyerService =
    options?.buyerService ?? container?.resolve(BuyerService);
  const walletService =
    options?.walletService ?? container?.resolve(WalletService);
  const topUpService =
    options?.topUpService ?? container?.resolve(TopUpService);
  const exchangeRateService =
    options?.exchangeRateService ?? container?.resolve(ExchangeRateService);
  const bankAccountService =
    options?.bankAccountService ?? container?.resolve(BankAccountService);

  if (
    !buyerService ||
    !walletService ||
    !topUpService ||
    !exchangeRateService ||
    !bankAccountService
  ) {
    throw new Error('All required services or a container must be provided to createBuyerComposer');
  }

  // Commands
  composer.command('start', async (ctx) => {
    await handleStart(ctx, buyerService, { adminIds: options?.adminIds });
  });

  composer.command('balance', async (ctx) => {
    await handleBalance(ctx, walletService);
  });

  composer.command('topup', async (ctx) => {
    await handleTopUpCommand(ctx, {
      exchangeRateService,
      bankAccountService,
      buyerService,
      topUpService,
      adminIds: options?.adminIds,
    });
  });

  composer.command('cancel', async (ctx) => {
    await handleCancelCommand(ctx, { buyerService, topUpService });
  });

  composer.command('status', async (ctx) => {
    await handleStatusCommand(ctx, { buyerService, topUpService });
  });

  // Menu Button Handlers (Hears)
  composer.hears(['💰 موجودی کیف پول', 'موجودی کیف پول', 'موجودی'], async (ctx) => {
    await handleBalance(ctx, walletService);
  });

  composer.hears(['➕ افزایش موجودی', 'افزایش موجودی', 'شارژ کیف پول'], async (ctx) => {
    await handleTopUpCommand(ctx, {
      exchangeRateService,
      bankAccountService,
      buyerService,
      topUpService,
      adminIds: options?.adminIds,
    });
  });

  composer.hears(['📋 پیگیری وضعیت', 'پیگیری وضعیت', 'وضعیت درخواست'], async (ctx) => {
    await handleStatusCommand(ctx, { buyerService, topUpService });
  });

  composer.hears(['❌ لغو درخواست', 'لغو درخواست'], async (ctx) => {
    await handleCancelCommand(ctx, { buyerService, topUpService });
  });

  composer.hears(['🏠 منوی اصلی', 'منوی اصلی'], async (ctx) => {
    await handleStart(ctx, buyerService, { adminIds: options?.adminIds });
  });

  // Media
  composer.on('message:photo', async (ctx) => {
    await handlePhotoMessage(ctx, {
      buyerService,
      topUpService,
      adminIds: options?.adminIds,
    });
  });

  return composer;
}
