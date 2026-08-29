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
    options?.buyerService ??
    (container ? container.resolve(BuyerService) : undefined);
  const walletService =
    options?.walletService ??
    (container ? container.resolve(WalletService) : undefined);
  const topUpService =
    options?.topUpService ??
    (container ? container.resolve(TopUpService) : undefined);
  const exchangeRateService =
    options?.exchangeRateService ??
    (container ? container.resolve(ExchangeRateService) : undefined);
  const bankAccountService =
    options?.bankAccountService ??
    (container ? container.resolve(BankAccountService) : undefined);

  // Commands
  composer.command('start', async (ctx) => {
    if (buyerService) {
      await handleStart(ctx, buyerService, { adminIds: options?.adminIds });
    }
  });

  composer.command('balance', async (ctx) => {
    if (walletService) {
      await handleBalance(ctx, walletService);
    }
  });

  composer.command('topup', async (ctx) => {
    if (exchangeRateService && bankAccountService && buyerService && topUpService) {
      await handleTopUpCommand(ctx, {
        exchangeRateService,
        bankAccountService,
        buyerService,
        topUpService,
        adminIds: options?.adminIds,
      });
    }
  });

  composer.command('cancel', async (ctx) => {
    if (buyerService && topUpService) {
      await handleCancelCommand(ctx, { buyerService, topUpService });
    }
  });

  composer.command('status', async (ctx) => {
    if (buyerService && topUpService) {
      await handleStatusCommand(ctx, { buyerService, topUpService });
    }
  });

  // Menu Button Handlers (Hears)
  composer.hears(['💰 موجودی کیف پول', 'موجودی کیف پول', 'موجودی'], async (ctx) => {
    if (walletService) {
      await handleBalance(ctx, walletService);
    }
  });

  composer.hears(['➕ افزایش موجودی', 'افزایش موجودی', 'شارژ کیف پول'], async (ctx) => {
    if (exchangeRateService && bankAccountService && buyerService && topUpService) {
      await handleTopUpCommand(ctx, {
        exchangeRateService,
        bankAccountService,
        buyerService,
        topUpService,
        adminIds: options?.adminIds,
      });
    }
  });

  composer.hears(['📋 پیگیری وضعیت', 'پیگیری وضعیت', 'وضعیت درخواست'], async (ctx) => {
    if (buyerService && topUpService) {
      await handleStatusCommand(ctx, { buyerService, topUpService });
    }
  });

  composer.hears(['❌ لغو درخواست', 'لغو درخواست'], async (ctx) => {
    if (buyerService && topUpService) {
      await handleCancelCommand(ctx, { buyerService, topUpService });
    }
  });

  composer.hears(['🏠 منوی اصلی', 'منوی اصلی'], async (ctx) => {
    if (buyerService) {
      await handleStart(ctx, buyerService, { adminIds: options?.adminIds });
    }
  });

  // Media
  composer.on('message:photo', async (ctx) => {
    if (buyerService && topUpService) {
      await handlePhotoMessage(ctx, {
        buyerService,
        topUpService,
        adminIds: options?.adminIds,
      });
    }
  });

  return composer;
}
