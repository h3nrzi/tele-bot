import type { BotContext } from '@/core/bot/context';
import { resolveAdminIds } from '@/core/bot/middleware/admin.middleware';
import type { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import type { BankAccountService } from '@/modules/bank-account/bank-account.service';
import type { BuyerService } from '@/modules/buyer/buyer.service';
import type { TopUpService } from '@/modules/top-up/top-up.service';
import {
  getTopUpUnavailableMessage,
  getTopUpActiveExistsMessage,
  getAdminNoRateAlertMessage,
} from '@/modules/top-up/presentation/buyer/top-up.messages';
import { TOPUP_CONVERSATION_ID } from '@/modules/top-up/presentation/buyer/top-up.conversation';

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
  deps: TopUpHandlerDependencies
): Promise<void> {
  const sender = ctx.from;
  if (!sender) {
    return;
  }

  // 1. Check if Exchange Rate is configured
  const currentRate = await deps.exchangeRateService.getCurrentRate();
  if (!currentRate) {
    await ctx.reply(getTopUpUnavailableMessage());

    const adminIds = resolveAdminIds(deps.adminIds);

    const alertMsg = getAdminNoRateAlertMessage();
    for (const adminId of adminIds) {
      try {
        await ctx.api.sendMessage(Number(adminId), alertMsg);
      } catch {
        // Ignore API failures during alert delivery
      }
    }
    return;
  }

  // 2. Check active bank account
  const activeAccount = await deps.bankAccountService.getActiveAccount();
  if (!activeAccount) {
    await ctx.reply(getTopUpUnavailableMessage());
    return;
  }

  // 3. Register / get Buyer
  const { buyer } = await deps.buyerService.register({
    telegramChatId: sender.id,
    telegramUsername: sender.username ?? null,
  });

  // 4. Check for active request
  const activeRequest = await deps.topUpService.getActiveTopUpRequest(buyer.id);
  if (activeRequest) {
    await ctx.reply(getTopUpActiveExistsMessage());
    return;
  }

  // 5. Enter conversation
  await ctx.conversation.enter(TOPUP_CONVERSATION_ID);
}
