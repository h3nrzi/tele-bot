import type { Context } from 'grammy';
import type { TopUpService } from '@/modules/top-up/top-up.service';
import type { BuyerService } from '@/modules/buyer/buyer.service';
import {
  CannotCancelPendingTopUpError,
  NoActiveTopUpRequestError,
} from '@/modules/top-up/top-up.errors';
import { getBuyerMainMenuKeyboard } from '@/bot/keyboards/menu.keyboards';

export interface CancelHandlerDependencies {
  buyerService: BuyerService;
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

  const { buyerService, topUpService } = deps;

  const buyer = await buyerService.findByTelegramChatId(sender.id);
  if (!buyer) {
    return;
  }

  try {
    await topUpService.cancelTopUp({ userId: buyer.id });
    await ctx.reply('درخواست افزایش موجودی شما با موفقیت لغو شد.', {
      reply_markup: getBuyerMainMenuKeyboard(),
    });
  } catch (err: any) {
    if (err instanceof CannotCancelPendingTopUpError) {
      await ctx.reply(
        'امکان لغو این درخواست وجود ندارد زیرا رسید پرداخت ارسال شده است. لطفاً منتظر بررسی ادمین باشید.',
        {
          reply_markup: getBuyerMainMenuKeyboard(),
        }
      );
      return;
    }
    if (err instanceof NoActiveTopUpRequestError) {
      await ctx.reply(
        'شما در حال حاضر هیچ درخواست افزایش موجودی فعالی برای لغو ندارید.',
        {
          reply_markup: getBuyerMainMenuKeyboard(),
        }
      );
      return;
    }
    throw err;
  }
}
