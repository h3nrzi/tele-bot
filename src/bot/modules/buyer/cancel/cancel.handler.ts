import type { Context } from 'grammy';
import type { DbClient } from '../../../../db/client';
import { buyerRepository } from '../../../../infrastructure/repositories/drizzle-buyer.repository';
import { cancelTopUp } from '../../../../application/top-up/top-up.service';
import {
  CannotCancelPendingTopUpError,
  NoActiveTopUpRequestError,
} from '../../../../domain/top-up/top-up.errors';
import {
  getCancelSuccessMessage,
  getCannotCancelPendingMessage,
  getNoActiveRequestToCancelMessage,
} from './cancel.messages';

/**
 * Handles the /cancel command:
 * - Silently ignored for unregistered senders (no users row).
 * - Forwards cancellation to the cancellation service.
 * - Replies with clear outcome for each case: cancelled, cannot cancel (receipt submitted), no active request.
 */
export async function handleCancelCommand(
  ctx: Context,
  dbClient?: DbClient
): Promise<void> {
  const sender = ctx.from;
  if (!sender) {
    return;
  }

  const buyer = await buyerRepository.findByTelegramChatId(
    BigInt(sender.id),
    dbClient
  );

  if (!buyer) {
    return;
  }

  try {
    await cancelTopUp({ userId: buyer.id }, dbClient);
    await ctx.reply(getCancelSuccessMessage());
  } catch (err: any) {
    if (err instanceof CannotCancelPendingTopUpError) {
      await ctx.reply(getCannotCancelPendingMessage());
      return;
    }
    if (err instanceof NoActiveTopUpRequestError) {
      await ctx.reply(getNoActiveRequestToCancelMessage());
      return;
    }
    throw err;
  }
}
