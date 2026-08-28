import type { Context } from 'grammy';
import type { IBuyerRepository } from '@/modules/buyer/buyer.repository.interface';
import { TopUpService } from '@/modules/top-up/top-up.service';
import type { DbClient } from '@/core/database/client';
import { createAppContainer } from '@/core/di/container';
import { TOKENS } from '@/core/di/tokens';
import {
  CannotCancelPendingTopUpError,
  NoActiveTopUpRequestError,
} from '@/modules/top-up/top-up.errors';
import {
  getCancelSuccessMessage,
  getCannotCancelPendingMessage,
  getNoActiveRequestToCancelMessage,
} from '@/bot/handlers/buyer/cancel.messages';
import { getBuyerMainMenuKeyboard } from '@/bot/keyboards/menu.keyboards';

export interface CancelHandlerDependencies {
  buyerRepo: IBuyerRepository;
  topUpService: TopUpService;
}

/**
 * Handles the /cancel command.
 */
export async function handleCancelCommand(
  ctx: Context,
  depsOrDb?: CancelHandlerDependencies | DbClient
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

  try {
    await topUpService.cancelTopUp({ userId: buyer.id });
    await ctx.reply(getCancelSuccessMessage(), {
      reply_markup: getBuyerMainMenuKeyboard(),
    });
  } catch (err: any) {
    if (err instanceof CannotCancelPendingTopUpError) {
      await ctx.reply(getCannotCancelPendingMessage(), {
        reply_markup: getBuyerMainMenuKeyboard(),
      });
      return;
    }
    if (err instanceof NoActiveTopUpRequestError) {
      await ctx.reply(getNoActiveRequestToCancelMessage(), {
        reply_markup: getBuyerMainMenuKeyboard(),
      });
      return;
    }
    throw err;
  }
}
