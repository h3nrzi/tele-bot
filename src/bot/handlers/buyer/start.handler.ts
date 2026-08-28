import type { Context } from 'grammy';
import { BuyerService } from '@/modules/buyer/buyer.service';
import type { DbClient } from '@/core/database/client';
import { createAppContainer } from '@/core/di/container';
import { isAdmin } from '@/bot/middleware/admin.middleware';
import {
  getNewBuyerWelcomeMessage,
  getReturningBuyerWelcomeMessage,
  getAdminWelcomeMessage,
} from '@/bot/handlers/buyer/start.messages';
import {
  getBuyerMainMenuKeyboard,
  getAdminMainMenuKeyboard,
} from '@/bot/keyboards/menu.keyboards';

export interface StartHandlerOptions {
  adminIds?: string | Set<bigint> | undefined;
}

/**
 * Handles the /start command.
 */
export async function handleStart(
  ctx: Context,
  buyerServiceOrDb?: BuyerService | DbClient,
  options?: StartHandlerOptions
): Promise<void> {
  if (!ctx.from) {
    return;
  }

  const buyerService =
    buyerServiceOrDb instanceof BuyerService
      ? buyerServiceOrDb
      : createAppContainer({ dbClient: buyerServiceOrDb, child: true }).resolve(BuyerService);

  const displayName =
    ctx.from.first_name?.trim() ||
    (ctx.from.username ? `@${ctx.from.username}` : null);

  if (isAdmin(ctx.from.id, options?.adminIds)) {
    await ctx.reply(getAdminWelcomeMessage(displayName), {
      reply_markup: getAdminMainMenuKeyboard(),
    });
    return;
  }

  const result = await buyerService.register({
    telegramChatId: ctx.from.id,
    telegramUsername: ctx.from.username ?? null,
  });

  if (result.isNew) {
    await ctx.reply(getNewBuyerWelcomeMessage(), {
      reply_markup: getBuyerMainMenuKeyboard(),
    });
  } else {
    await ctx.reply(
      getReturningBuyerWelcomeMessage(displayName, result.wallet.availableBalance),
      {
        reply_markup: getBuyerMainMenuKeyboard(),
      }
    );
  }
}
