import type { BotContext } from '@/bot/context';
import { resolveAdminIds } from '@/bot/middleware/admin.middleware';
import { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import { BankAccountService } from '@/modules/bank-account/bank-account.service';
import { BuyerService } from '@/modules/buyer/buyer.service';
import { TopUpService } from '@/modules/top-up/top-up.service';
import type { DbClient } from '@/core/database/client';
import { createAppContainer } from '@/core/di/container';
import {
  getTopUpUnavailableMessage,
  getTopUpActiveExistsMessage,
  getAdminNoRateAlertMessage,
} from '@/bot/handlers/buyer/top-up.messages';
import { TOPUP_CONVERSATION_ID } from '@/bot/handlers/buyer/top-up.conversation';

export interface TopUpHandlerDependencies {
  exchangeRateService: ExchangeRateService;
  bankAccountService: BankAccountService;
  buyerService: BuyerService;
  topUpService: TopUpService;
  adminIds?: string | Set<bigint> | undefined;
}

/**
 * Handles the /topup command entry.
 */
export async function handleTopUpCommand(
  ctx: BotContext,
  depsOrDb?: TopUpHandlerDependencies | DbClient,
  options?: { adminIds?: string | Set<bigint> | undefined }
): Promise<void> {
  const sender = ctx.from;
  if (!sender) {
    return;
  }

  const isDeps = depsOrDb && 'topUpService' in depsOrDb;
  const container = isDeps
    ? null
    : createAppContainer({ dbClient: depsOrDb as DbClient, child: true });

  const exchangeRateService = isDeps
    ? depsOrDb.exchangeRateService
    : container!.resolve(ExchangeRateService);

  const bankAccountService = isDeps
    ? depsOrDb.bankAccountService
    : container!.resolve(BankAccountService);

  const buyerService = isDeps
    ? depsOrDb.buyerService
    : container!.resolve(BuyerService);

  const topUpService = isDeps
    ? depsOrDb.topUpService
    : container!.resolve(TopUpService);

  const adminIds = isDeps ? depsOrDb.adminIds : options?.adminIds;

  // 1. Check if Exchange Rate is configured
  const currentRate = await exchangeRateService.getCurrentRate();
  if (!currentRate) {
    await ctx.reply(getTopUpUnavailableMessage());

    const resolvedAdminIds = resolveAdminIds(adminIds);
    const alertMsg = getAdminNoRateAlertMessage();
    for (const adminId of resolvedAdminIds) {
      try {
        await ctx.api.sendMessage(Number(adminId), alertMsg);
      } catch {
        // Ignore API failures during alert delivery
      }
    }
    return;
  }

  // 2. Check active bank account
  const activeAccount = await bankAccountService.getActiveAccount();
  if (!activeAccount) {
    await ctx.reply(getTopUpUnavailableMessage());
    return;
  }

  // 3. Register / get Buyer
  const { buyer } = await buyerService.register({
    telegramChatId: sender.id,
    telegramUsername: sender.username ?? null,
  });

  // 4. Check for active request
  const activeRequest = await topUpService.getActiveTopUpRequest(buyer.id);
  if (activeRequest) {
    await ctx.reply(getTopUpActiveExistsMessage());
    return;
  }

  // 5. Enter conversation
  await ctx.conversation.enter(TOPUP_CONVERSATION_ID);
}
