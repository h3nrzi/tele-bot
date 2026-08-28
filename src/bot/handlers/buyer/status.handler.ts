import type { Context } from 'grammy';
import type { IBuyerRepository } from '@/modules/buyer/buyer.repository.interface';
import { TopUpService } from '@/modules/top-up/top-up.service';
import type { DbClient } from '@/core/database/client';
import { createAppContainer } from '@/core/di/container';
import { TOKENS } from '@/core/di/tokens';
import {
  getNoTopUpHistoryMessage,
  formatStatusMessage,
} from '@/bot/handlers/buyer/status.messages';
import { getBuyerMainMenuKeyboard } from '@/bot/keyboards/menu.keyboards';

export interface StatusHandlerDependencies {
  buyerRepo: IBuyerRepository;
  topUpService: TopUpService;
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

  const isDeps = depsOrDb && 'topUpService' in depsOrDb;
  const container = isDeps
    ? null
    : createAppContainer({ dbClient: depsOrDb as DbClient, child: true });

  const buyerRepo = isDeps
    ? depsOrDb.buyerRepo
    : container!.resolve<IBuyerRepository>(TOKENS.BuyerRepository);

  const topUpService = isDeps
    ? depsOrDb.topUpService
    : container!.resolve(TopUpService);

  const buyer = await buyerRepo.findByTelegramChatId(
    BigInt(sender.id)
  );

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
