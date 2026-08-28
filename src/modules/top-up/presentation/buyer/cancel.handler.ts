import type { Context } from 'grammy';
import type { IBuyerRepository } from '@/modules/buyer/buyer.repository.interface';
import type { TopUpService } from '@/modules/top-up/top-up.service';
import {
  CannotCancelPendingTopUpError,
  NoActiveTopUpRequestError,
} from '@/modules/top-up/top-up.errors';
import {
  getCancelSuccessMessage,
  getCannotCancelPendingMessage,
  getNoActiveRequestToCancelMessage,
} from '@/modules/top-up/presentation/buyer/cancel.messages';
import { getBuyerMainMenuKeyboard } from '@/core/bot/keyboards/menu.keyboards';

export interface CancelHandlerDependencies {
  buyerRepo: IBuyerRepository;
  topUpService: TopUpService;
}

/**
 * Handles the /cancel command.
 */
export async function handleCancelCommand(
  ctx: Context,
  deps: CancelHandlerDependencies
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

  try {
    await deps.topUpService.cancelTopUp({ userId: buyer.id });
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
