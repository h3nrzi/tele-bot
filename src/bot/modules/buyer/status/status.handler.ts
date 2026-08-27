import type { Context } from 'grammy';
import type { DbClient } from '../../../../db/client';
import { buyerRepository } from '../../../../infrastructure/repositories/drizzle-buyer.repository';
import { getLatestTopUpRequest } from '../../../../application/top-up/top-up.service';
import {
  getNoTopUpHistoryMessage,
  formatStatusMessage,
} from './status.messages';

/**
 * Handles the /status command:
 * - Silently ignored for unregistered senders (no users row).
 * - If no request exists, tells the Buyer they have no top-up history.
 * - Otherwise formats and replies with a status message including status, USD, IRR, date, and rejection reason (if rejected).
 */
export async function handleStatusCommand(
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

  const latestRequest = await getLatestTopUpRequest(buyer.id, dbClient);
  if (!latestRequest) {
    await ctx.reply(getNoTopUpHistoryMessage());
    return;
  }

  await ctx.reply(
    formatStatusMessage({
      status: latestRequest.status,
      usdAmount: latestRequest.usdAmount,
      irrAmount: latestRequest.irrAmount,
      createdAt: latestRequest.createdAt,
      rejectionReason: latestRequest.rejectionReason,
    })
  );
}
