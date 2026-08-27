import type { Context } from 'grammy';
import type { DbClient } from '../../../../db/client';
import type { BotContext, BotConversation } from '../../../core/context';
import {
  initiateTopUp,
} from '../../../../application/top-up/top-up.service';
import {
  ActiveTopUpRequestExistsError,
} from '../../../../domain/top-up/top-up.errors';
import {
  NoExchangeRateError,
} from '../../../../domain/exchange-rate/exchange-rate.errors';
import {
  getActiveAccount,
} from '../../../../application/bank-account/bank-account.service';
import {
  NoActiveBankAccountError,
} from '../../../../domain/bank-account/bank-account.errors';
import { registerBuyer } from '../../../../application/buyer/registration.service';
import {
  getTopUpLimits,
  validateTopUpAmount,
  type TopUpLimits,
} from '../../../../utils/currency';
import { isCancelCommand } from '../../../../utils/telegram';
import {
  getTopUpPromptMessage,
  getTopUpUnavailableMessage,
  getTopUpActiveExistsMessage,
  getTopUpCancelledMessage,
  getTopUpSuccessMessage,
} from './top-up.messages';

export type TopUpConversation = BotConversation;
export const TOPUP_CONVERSATION_ID = 'topup';

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
          throw new NoActiveBankAccountError();
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
          request: {
            usdAmount: initResult.request.usdAmount,
            irrAmount: initResult.request.irrAmount,
            expiresAt: initResult.request.expiresAt,
          },
          activeAccount: {
            cardNumber: activeAcc.cardNumber,
            cardHolderName: activeAcc.cardHolderName,
            bankName: activeAcc.bankName,
            additionalNotes: activeAcc.additionalNotes,
            isActive: activeAcc.isActive,
            id: activeAcc.id,
            createdAt: activeAcc.createdAt,
          },
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
      if (err instanceof NoExchangeRateError || err instanceof NoActiveBankAccountError) {
        await ctx.reply(getTopUpUnavailableMessage());
        return;
      }
      throw err;
    }
  };
}
