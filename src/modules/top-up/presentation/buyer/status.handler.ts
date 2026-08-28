import type { Context } from 'grammy';
import type { IBuyerRepository } from '@/modules/buyer/buyer.repository.interface';
import type { TopUpService } from '@/modules/top-up/top-up.service';
import {
  getNoTopUpHistoryMessage,
  formatStatusMessage,
} from '@/modules/top-up/presentation/buyer/status.messages';
import { getBuyerMainMenuKeyboard } from '@/core/bot/keyboards/menu.keyboards';

export interface StatusHandlerDependencies {
  buyerRepo: IBuyerRepository;
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

  const buyer = await deps.buyerRepo.findByTelegramChatId(
    BigInt(sender.id)
  );

  if (!buyer) {
    return;
  }

  const latestRequest = await deps.topUpService.getLatestTopUpRequest(buyer.id);
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
