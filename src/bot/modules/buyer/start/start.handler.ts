import type { Context } from 'grammy';
import type { DbClient } from '../../../../db/client';
import { registerBuyer } from '../../../../application/buyer/registration.service';
import {
  getNewBuyerWelcomeMessage,
  getReturningBuyerWelcomeMessage,
} from './start.messages';

/**
 * Handles the /start command.
 * - For a new Buyer: registers Buyer + zero-balance Wallet and sends a welcome message.
 * - For a returning Buyer: retrieves Buyer + Wallet and sends a personalised greeting with Available Balance.
 */
export async function handleStart(
  ctx: Context,
  dbClient?: DbClient
): Promise<void> {
  if (!ctx.from) {
    return;
  }

  const result = await registerBuyer(
    {
      telegramChatId: ctx.from.id,
      telegramUsername: ctx.from.username ?? null,
    },
    dbClient
  );

  const displayName =
    ctx.from.first_name?.trim() ||
    (ctx.from.username ? `@${ctx.from.username}` : null);

  if (result.isNew) {
    await ctx.reply(getNewBuyerWelcomeMessage());
  } else {
    await ctx.reply(
      getReturningBuyerWelcomeMessage(displayName, result.wallet.availableBalance)
    );
  }
}
