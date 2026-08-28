import type { Context } from 'grammy';
import type { BotConversation } from '@/bot/context';
import type { TopUpService } from '@/modules/top-up/top-up.service';
import type { BuyerService } from '@/modules/buyer/buyer.service';
import type { BankAccountService } from '@/modules/bank-account/bank-account.service';
import { ActiveTopUpRequestExistsError } from '@/modules/top-up/top-up.errors';
import { NoExchangeRateError } from '@/modules/exchange-rate/exchange-rate.errors';
import { NoActiveBankAccountError } from '@/modules/bank-account/bank-account.errors';
import { validateTopUpAmount } from '@/core/shared/currency.utils';
import { TopUpLimits } from '@/modules/top-up/top-up.limits.vo';
import { isCancelCommand } from '@/core/shared/telegram.utils';
import {
  getTopUpPromptMessage,
  getTopUpUnavailableMessage,
  getTopUpActiveExistsMessage,
  getTopUpCancelledMessage,
  getTopUpSuccessMessage,
} from '@/bot/handlers/buyer/top-up.messages';

export type TopUpConversation = BotConversation;
export const TOPUP_CONVERSATION_ID = 'topup';

/**
 * Creates the grammY conversation for the /topup command.
 */
export function createTopUpConversation(
  topUpService: TopUpService,
  buyerService: BuyerService,
  bankAccountService: BankAccountService,
  limitsSource?: TopUpLimits
) {
  return async function topup(
    conversation: TopUpConversation,
    ctx: Context
  ): Promise<void> {
    const limits = limitsSource ?? TopUpLimits.fromEnv();

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
        const { buyer } = await buyerService.register({
          telegramChatId: ctx.from!.id,
          telegramUsername: ctx.from?.username ?? null,
        });

        const activeAcc = await bankAccountService.getActiveAccount();
        if (!activeAcc) {
          throw new NoActiveBankAccountError();
        }

        const initResult = await topUpService.initiateTopUp(
          {
            userId: buyer.id,
            usdAmount: amountString,
          },
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
