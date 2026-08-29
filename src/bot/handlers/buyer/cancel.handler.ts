import type { Context } from 'grammy';
import { TopUpService } from '@/modules/top-up/top-up.service';
import { BuyerService } from '@/modules/buyer/buyer.service';
import type { DbClient } from '@/core/database/client';
import { createAppContainer } from '@/core/di/container';
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
  buyerService?: BuyerService | undefined;
  topUpService?: TopUpService | undefined;
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

  const isDeps = depsOrDb && ('topUpService' in depsOrDb || 'buyerService' in depsOrDb);
  const container = isDeps
    ? null
    : createAppContainer({ dbClient: depsOrDb as DbClient, child: true });

  const buyerService = isDeps
    ? (depsOrDb as CancelHandlerDependencies).buyerService ?? createAppContainer({ child: true }).resolve(BuyerService)
    : container!.resolve(BuyerService);

  const topUpService = isDeps
    ? (depsOrDb as CancelHandlerDependencies).topUpService ?? createAppContainer({ child: true }).resolve(TopUpService)
    : container!.resolve(TopUpService);

  const buyer = await buyerService.findByTelegramChatId(sender.id);
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
