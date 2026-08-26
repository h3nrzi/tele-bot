import type { Context } from 'grammy';
import type { DbClient } from '../../db/client';
import { registerBuyer } from '../../application/buyer/registration.service';
import { formatUsd } from '../../utils/currency';

/**
 * Returns the welcome message for a newly registered Buyer.
 */
export function getNewBuyerWelcomeMessage(): string {
  return 'به Tele-Bot خوش آمدید! کیف پول شما ایجاد شد. موجودی در دسترس شما $0.00 است.';
}

/**
 * Returns the personalised greeting message for a returning Buyer with their Available Balance.
 */
export function getReturningBuyerWelcomeMessage(
  name: string | null | undefined,
  availableBalance: string
): string {
  const greetingName = name && name.trim().length > 0 ? ` ${name.trim()}` : '';
  return `خوش آمدید${greetingName}! موجودی در دسترس شما ${formatUsd(availableBalance)} است.`;
}

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
