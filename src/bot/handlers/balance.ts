import type { Context } from 'grammy';
import type { DbClient } from '../../db/client';
import { getBuyerWallet } from '../../services/wallet.service';
import { formatUsd } from '../../utils/currency';

/**
 * Returns the message showing the Buyer's current Available Balance.
 */
export function getBalanceMessage(availableBalance: string): string {
  return `Your current Available Balance is ${formatUsd(availableBalance)}.`;
}

/**
 * Returns the prompt message when an unregistered sender attempts to check balance.
 */
export function getUnregisteredBalanceMessage(): string {
  return 'Please send /start first to create your Wallet.';
}

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
