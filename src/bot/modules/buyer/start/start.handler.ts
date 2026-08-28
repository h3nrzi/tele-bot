import type { Context } from 'grammy';
import type { DbClient } from '@/db/client';
import { registerBuyer } from '@/application/buyer/registration.service';
import { isAdmin } from '@/bot/core/middleware/admin.middleware';
import {
  getNewBuyerWelcomeMessage,
  getReturningBuyerWelcomeMessage,
  getAdminWelcomeMessage,
} from '@/bot/modules/buyer/start/start.messages';
import {
  getBuyerMainMenuKeyboard,
  getAdminMainMenuKeyboard,
} from '@/bot/core/keyboards/menu.keyboards';

export interface StartHandlerOptions {
  adminIds?: string | Set<bigint> | undefined;
}

/**
 * Handles the /start command.
 * - For an Admin: sends the Admin welcome panel message with the Admin menu keyboard.
 * - For a new Buyer: registers Buyer + zero-balance Wallet and sends a welcome message with Buyer menu keyboard.
 * - For a returning Buyer: retrieves Buyer + Wallet and sends a personalised greeting with Available Balance and Buyer menu keyboard.
 */
export async function handleStart(
  ctx: Context,
  dbClient?: DbClient,
  options?: StartHandlerOptions
): Promise<void> {
  if (!ctx.from) {
    return;
  }

  const displayName =
    ctx.from.first_name?.trim() ||
    (ctx.from.username ? `@${ctx.from.username}` : null);

  if (isAdmin(ctx.from.id, options?.adminIds)) {
    await ctx.reply(getAdminWelcomeMessage(displayName), {
      reply_markup: getAdminMainMenuKeyboard(),
    });
    return;
  }

  const result = await registerBuyer(
    {
      telegramChatId: ctx.from.id,
      telegramUsername: ctx.from.username ?? null,
    },
    dbClient
  );

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
