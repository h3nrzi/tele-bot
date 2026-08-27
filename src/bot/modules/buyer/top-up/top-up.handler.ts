import type { DbClient } from '@/db/client';
import type { BotContext } from '@/bot/core/context';
import { resolveAdminIds } from '@/bot/core/middleware/admin.middleware';
import { getCurrentRate } from '@/application/exchange-rate/exchange-rate.service';
import { getActiveAccount } from '@/application/bank-account/bank-account.service';
import { registerBuyer } from '@/application/buyer/registration.service';
import { getActiveTopUpRequest } from '@/application/top-up/top-up.service';
import {
  getTopUpUnavailableMessage,
  getTopUpActiveExistsMessage,
  getAdminNoRateAlertMessage,
} from '@/bot/modules/buyer/top-up/top-up.messages';
import { TOPUP_CONVERSATION_ID } from '@/bot/modules/buyer/top-up/top-up.conversation';

/**
 * Handles the /topup command entry:
 * - Checks if exchange rate is configured (sends unavailable message to Buyer and alert to Admins if null)
 * - Checks if active Bank Account exists
 * - Registers/retrieves Buyer
 * - Checks if Buyer has an active request (INITIATED or PENDING)
 * - Starts topup conversation if eligible
 */
export async function handleTopUpCommand(
  ctx: BotContext,
  dbClient?: DbClient,
  options?: { adminIds?: string | Set<bigint> | undefined }
): Promise<void> {
  const sender = ctx.from;
  if (!sender) {
    return;
  }

  // 1. Check if Exchange Rate is configured
  const currentRate = await getCurrentRate(dbClient);
  if (!currentRate) {
    await ctx.reply(getTopUpUnavailableMessage());

    const adminIds = resolveAdminIds(options?.adminIds);

    const alertMsg = getAdminNoRateAlertMessage();
    for (const adminId of adminIds) {
      try {
        await ctx.api.sendMessage(Number(adminId), alertMsg);
      } catch {
        // Ignore API failures during alert delivery
      }
    }
    return;
  }

  // 2. Check active bank account
  const activeAccount = await getActiveAccount(dbClient);
  if (!activeAccount) {
    await ctx.reply(getTopUpUnavailableMessage());
    return;
  }

  // 3. Register / get Buyer
  const { buyer } = await registerBuyer(
    {
      telegramChatId: sender.id,
      telegramUsername: sender.username ?? null,
    },
    dbClient
  );

  // 4. Check for active request
  const activeRequest = await getActiveTopUpRequest(buyer.id, dbClient);
  if (activeRequest) {
    await ctx.reply(getTopUpActiveExistsMessage());
    return;
  }

  // 5. Enter conversation
  await ctx.conversation.enter(TOPUP_CONVERSATION_ID);
}
