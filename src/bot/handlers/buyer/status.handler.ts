import type { Context } from 'grammy';
import { TopUpService } from '@/modules/top-up/top-up.service';
import { BuyerService } from '@/modules/buyer/buyer.service';
import type { DbClient } from '@/core/database/client';
import { createAppContainer } from '@/core/di/container';
import {
  getNoTopUpHistoryMessage,
  formatStatusMessage,
} from '@/bot/handlers/buyer/status.messages';
import { getBuyerMainMenuKeyboard } from '@/bot/keyboards/menu.keyboards';

export interface StatusHandlerDependencies {
  buyerService?: BuyerService | undefined;
  topUpService?: TopUpService | undefined;
}

/**
 * Handles the /status command.
 */
export async function handleStatusCommand(
  ctx: Context,
  depsOrDb?: StatusHandlerDependencies | DbClient
): Promise<void> {
  const sender = ctx.from;
  if (!sender) {
    return;
  }

  const isDeps = depsOrDb && ('topUpService' in depsOrDb || 'buyerService' in depsOrDb);
  const container = isDeps
    ? null
    : createAppContainer({ dbClient: depsOrDb as DbClient, child: true });

  const buyerService = isDeps
    ? (depsOrDb as StatusHandlerDependencies).buyerService ?? createAppContainer({ child: true }).resolve(BuyerService)
    : container!.resolve(BuyerService);

  const topUpService = isDeps
    ? (depsOrDb as StatusHandlerDependencies).topUpService ?? createAppContainer({ child: true }).resolve(TopUpService)
    : container!.resolve(TopUpService);

  const buyer = await buyerService.findByTelegramChatId(sender.id);
  if (!buyer) {
    return;
  }

  const latestRequest = await topUpService.getLatestTopUpRequest(buyer.id);
  if (!latestRequest) {
    await ctx.reply(getNoTopUpHistoryMessage(), {
      reply_markup: getBuyerMainMenuKeyboard(),
    });
    return;
  }

  await ctx.reply(
    formatStatusMessage({
      status: latestRequest.status,
      usdAmount: latestRequest.usdAmount,
      irrAmount: latestRequest.irrAmount,
      createdAt: latestRequest.createdAt,
      rejectionReason: latestRequest.rejectionReason,
    }),
    {
      reply_markup: getBuyerMainMenuKeyboard(),
    }
  );
}
