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

import { isCancelCommand } from '../../utils/telegram';

export { isCancelCommand };

export function getTopUpPromptMessage(minUsd: Decimal, maxUsd: Decimal): string {
  return `لطفاً مبلغ مورد نظر برای افزایش موجودی به دلار را وارد کنید (حداقل: ${formatUsd(minUsd)}، حداکثر: ${formatUsd(maxUsd)})، یا برای انصراف /cancel را ارسال کنید:`;
}

export function getTopUpUnavailableMessage(): string {
  return 'افزایش موجودی موقتاً در دسترس نیست. لطفاً بعداً تلاش کنید.';
}

export function getTopUpActiveExistsMessage(): string {
  return 'شما یک درخواست افزایش موجودی فعال دارید. لطفاً قبل از ثبت درخواست جدید، درخواست قبلی را تکمیل یا لغو کنید.';
}

export function getTopUpCancelledMessage(): string {
  return 'درخواست افزایش موجودی لغو شد.';
}

export function getAdminNoRateAlertMessage(): string {
  return '⚠️ فوری: کاربری قصد افزایش موجودی داشت اما هیچ نرخ ارزی تنظیم نشده است! لطفاً هرچه سریع‌تر با دستور /setrate نرخ ارز را مشخص کنید.';
}

export function getTopUpSuccessMessage(details: {
  usdAmount: string;
  irrAmount: bigint;
  bankAccount: BankAccount;
  expiresAt: Date;
}): string {
  const notesLine = details.bankAccount.additionalNotes
    ? `توضیحات: ${details.bankAccount.additionalNotes}\n`
    : '';

  return (
    `درخواست افزایش موجودی ثبت شد!\n\n` +
    `مبلغ: ${formatUsd(details.usdAmount)}\n` +
    `مبلغ پرداختی به ریال: ${formatIrr(details.irrAmount)} ریال\n\n` +
    `مشخصات حساب بانکی:\n` +
    `شماره کارت: ${details.bankAccount.cardNumber}\n` +
    `صاحب حساب: ${details.bankAccount.cardHolderName}\n` +
    `بانک: ${details.bankAccount.bankName}\n` +
    notesLine +
    `\nلطفاً مبلغ دقیق ریالی را به حساب بانکی فوق واریز نمایید. پس از واریز، عکس رسید پرداخت خود را ارسال کنید.`
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
        `${validation.message}\n\nلطفاً یک مبلغ معتبر به دلار وارد کنید (یا برای انصراف /cancel را ارسال کنید):`
      );
    }

    try {
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
          throw new Error('NO_ACTIVE_BANK_ACCOUNT');
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
    } catch (err: any) {
      if (err instanceof ActiveTopUpRequestExistsError) {
        await ctx.reply(getTopUpActiveExistsMessage());
        return;
      }
      if (err instanceof NoExchangeRateError || err?.message === 'NO_ACTIVE_BANK_ACCOUNT') {
        await ctx.reply(getTopUpUnavailableMessage());
        return;
      }
      throw err;
    }
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
