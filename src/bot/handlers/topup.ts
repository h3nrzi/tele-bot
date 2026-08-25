import type { Conversation, ConversationFlavor } from '@grammyjs/conversations';
import type { Context } from 'grammy';
import type { DbClient } from '../../db/client';
import {
  initiateTopUp,
  getActiveTopUpRequest,
  NoExchangeRateError,
  ActiveTopUpRequestExistsError,
} from '../../services/top-up.service';
import { getCurrentRate } from '../../services/exchange-rate.service';
import { getActiveAccount } from '../../services/bank-account.service';
import { registerBuyer } from '../../services/registration.service';
import { parseAdminIds } from '../middleware/admin';
import {
  formatUsd,
  formatIrr,
  getTopUpLimits,
  validateTopUpAmount,
  type TopUpLimits,
} from '../../utils/currency';
import type { BankAccount } from '../../db/schema/bank-accounts';
import Decimal from 'decimal.js';

export type BotContext = ConversationFlavor<Context>;
export type TopUpConversation = Conversation<BotContext, Context>;

export const TOPUP_CONVERSATION_ID = 'topup';

/**
 * Checks if the message text is a cancel command (/cancel or cancel).
 */
export function isCancelCommand(raw: string): boolean {
  if (!raw) {
    return false;
  }
  const trimmed = raw.trim();
  return /^\/cancel(@\w+)?$/i.test(trimmed) || trimmed.toLowerCase() === 'cancel';
}

export function getTopUpPromptMessage(minUsd: Decimal, maxUsd: Decimal): string {
  return `Please enter the USD amount you would like to top up (min: ${formatUsd(minUsd)}, max: ${formatUsd(maxUsd)}), or send /cancel to abort:`;
}

export function getTopUpUnavailableMessage(): string {
  return 'Top-up is temporarily unavailable. Please try again later.';
}

export function getTopUpActiveExistsMessage(): string {
  return 'You already have an active Top-Up Request. Please complete or cancel your existing request before opening a new one.';
}

export function getTopUpCancelledMessage(): string {
  return 'Top-up request cancelled.';
}

export function getAdminNoRateAlertMessage(): string {
  return '⚠️ Urgent: A Buyer attempted to initiate a top-up, but no Exchange Rate is configured! Please use /setrate to set an exchange rate immediately.';
}

export function getTopUpSuccessMessage(details: {
  usdAmount: string;
  irrAmount: bigint;
  bankAccount: BankAccount;
  expiresAt: Date;
}): string {
  const notesLine = details.bankAccount.additionalNotes
    ? `Instructions: ${details.bankAccount.additionalNotes}\n`
    : '';

  return (
    `Top-Up Request Initiated!\n\n` +
    `Amount: ${formatUsd(details.usdAmount)}\n` +
    `IRR to Transfer: ${formatIrr(details.irrAmount)} IRR\n\n` +
    `Bank Card Details:\n` +
    `Card Number: ${details.bankAccount.cardNumber}\n` +
    `Card Holder: ${details.bankAccount.cardHolderName}\n` +
    `Bank: ${details.bankAccount.bankName}\n` +
    notesLine +
    `\nPlease transfer the exact IRR amount to the bank card above. After completing the transfer, send your payment receipt photo.`
  );
}

/**
 * Creates the grammY conversation for the /topup command.
 */
export function createTopUpConversation(
  dbClient?: DbClient,
  limitsSource?: TopUpLimits
) {
  return async function topup(
    conversation: TopUpConversation,
    ctx: Context
  ): Promise<void> {
    const limits = limitsSource ?? getTopUpLimits();

    await ctx.reply(getTopUpPromptMessage(limits.minUsd, limits.maxUsd));

    let amountString = '';
    while (true) {
      const nextCtx = await conversation.wait();
      const text = nextCtx.message?.text ?? '';

      if (isCancelCommand(text)) {
        await nextCtx.reply(getTopUpCancelledMessage());
        return;
      }

      const validation = validateTopUpAmount(text, limits);
      if (validation.valid) {
        amountString = validation.amountString;
        break;
      }

      await nextCtx.reply(
        `${validation.message}\n\nPlease enter a valid USD amount (or send /cancel to abort):`
      );
    }

    const { request, activeAccount } = await conversation.external(async () => {
      const { buyer } = await registerBuyer(
        {
          telegramChatId: ctx.from!.id,
          telegramUsername: ctx.from?.username ?? null,
        },
        dbClient
      );

      const activeAcc = await getActiveAccount(dbClient);
      if (!activeAcc) {
        throw new Error('No active bank account available.');
      }

      const initResult = await initiateTopUp(
        {
          userId: buyer.id,
          usdAmount: amountString,
        },
        dbClient,
        limits
      );

      return {
        request: initResult.request,
        activeAccount: activeAcc,
      };
    });

    await ctx.reply(
      getTopUpSuccessMessage({
        usdAmount: request.usdAmount,
        irrAmount: request.irrAmount,
        bankAccount: activeAccount,
        expiresAt: request.expiresAt,
      })
    );
  };
}

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

    const adminIds = parseAdminIds(
      typeof options?.adminIds === 'string'
        ? options.adminIds
        : process.env.ADMIN_IDS
    );
    if (options?.adminIds instanceof Set) {
      for (const id of options.adminIds) {
        adminIds.add(id);
      }
    }

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
