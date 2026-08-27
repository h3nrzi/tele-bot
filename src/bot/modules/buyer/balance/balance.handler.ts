import type { Context } from 'grammy';
import type { DbClient } from '../../../../db/client';
import { getBuyerWallet } from '../../../../application/wallet/wallet.service';
import {
  getBalanceMessage,
  getUnregisteredBalanceMessage,
} from './balance.messages';

/**
 * Handles the /balance command.
 * - For a registered Buyer: returns their current Available Balance.
 * - For an unregistered sender: prompts them to send /start first.
 * - For updates without sender info (ctx.from undefined): silently ignores.
 */
export async function handleBalance(
  ctx: Context,
  dbClient?: DbClient
): Promise<void> {
  if (!ctx.from) {
    return;
  }

  const result = await getBuyerWallet(
    {
      telegramChatId: ctx.from.id,
    },
    dbClient
  );

  if (!result) {
    await ctx.reply(getUnregisteredBalanceMessage());
    return;
  }

  await ctx.reply(getBalanceMessage(result.wallet.availableBalance));
}
