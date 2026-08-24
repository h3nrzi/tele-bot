import type { Context } from 'grammy';
import type { DbClient } from '../../db/client';
import { registerBuyer } from '../../services/registration.service';
import { formatUsd } from '../../utils/currency';

/**
 * Returns the welcome message for a newly registered Buyer.
 */
export function getNewBuyerWelcomeMessage(): string {
  return 'Welcome to Tele-Bot! Your account and USD wallet have been created. Your current Available Balance is $0.00.';
}

/**
 * Returns the personalised greeting message for a returning Buyer with their Available Balance.
 */
export function getReturningBuyerWelcomeMessage(
  name: string | null | undefined,
  availableBalance: string
): string {
  const greetingName = name && name.trim().length > 0 ? `, ${name.trim()}` : '';
  return `Welcome back${greetingName}! Your current Available Balance is ${formatUsd(availableBalance)}.`;
}

/**
 * Handles the /start command.
 * - For a new Buyer: creates user + zero-balance wallet and sends a welcome message.
 * - For a returning Buyer: retrieves user + wallet and sends a personalised greeting with Available Balance.
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
