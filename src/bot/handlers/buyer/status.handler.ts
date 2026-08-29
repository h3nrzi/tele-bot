import type { Context } from 'grammy';
import type { TopUpService } from '@/modules/top-up/top-up.service';
import type { BuyerService } from '@/modules/buyer/buyer.service';
import {
  getNoTopUpHistoryMessage,
  formatStatusMessage,
} from '@/bot/handlers/buyer/status.messages';
import { getBuyerMainMenuKeyboard } from '@/bot/keyboards/menu.keyboards';

export interface StatusHandlerDependencies {
  buyerService: BuyerService;
  topUpService: TopUpService;
}

/**
 * Handles the /status command.
 */
export async function handleStatusCommand(
  ctx: Context,
  deps: StatusHandlerDependencies
): Promise<void> {
  const sender = ctx.from;
  if (!sender) {
    return;
  }

  const { buyerService, topUpService } = deps;

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
