import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import type { BotConversation } from '@/bot/context';
import type { TopUpService } from '@/modules/top-up/top-up.service';
import type { BuyerService } from '@/modules/buyer/buyer.service';
import type { BankAccountService } from '@/modules/bank-account/bank-account.service';
import { ActiveTopUpRequestExistsError } from '@/modules/top-up/top-up.errors';
import { NoExchangeRateError } from '@/modules/exchange-rate/exchange-rate.errors';
import { NoActiveBankAccountError } from '@/modules/bank-account/bank-account.errors';
import { validateTopUpAmount, formatUsd, formatIrr } from '@/core/shared/currency.utils';
import { TopUpLimits } from '@/modules/top-up/top-up.limits.vo';
import { isCancelCommand } from '@/core/shared/telegram.utils';

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

    await ctx.reply(
      `لطفاً مبلغ مورد نظر برای افزایش موجودی به دلار را وارد کنید (حداقل: ${formatUsd(limits.minUsd)}، حداکثر: ${formatUsd(limits.maxUsd)}):`,
      {
        reply_markup: new InlineKeyboard().text('❌ انصراف', 'flow:cancel'),
      }
    );

    let amountString = '';
    while (true) {
      const nextCtx = await conversation.wait();
      const text = nextCtx.message?.text ?? '';
      const callbackData = nextCtx.callbackQuery?.data;

      if (
        callbackData === 'flow:cancel' ||
        callbackData === 'topup:cancel' ||
        isCancelCommand(text)
      ) {
        if (nextCtx.callbackQuery) {
          try {
            await nextCtx.answerCallbackQuery();
          } catch {}
        }
        await nextCtx.reply('درخواست افزایش موجودی لغو شد.');
        return;
      }

      const validation = validateTopUpAmount(text, limits);
      if (validation.valid) {
        amountString = validation.amountString;
        break;
      }

      await nextCtx.reply(
        `${validation.message}\n\nلطفاً یک مبلغ معتبر به دلار وارد کنید:`,
        {
          reply_markup: new InlineKeyboard().text('❌ انصراف', 'flow:cancel'),
        }
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

      const notesLine = activeAccount.additionalNotes
        ? `توضیحات: ${activeAccount.additionalNotes}\n`
        : '';

      await ctx.reply(
        `درخواست افزایش موجودی ثبت شد!\n\n` +
        `مبلغ: ${formatUsd(request.usdAmount)}\n` +
        `مبلغ پرداختی به ریال: ${formatIrr(request.irrAmount)} ریال\n\n` +
        `مشخصات حساب بانکی:\n` +
        `شماره کارت: ${activeAccount.cardNumber}\n` +
        `صاحب حساب: ${activeAccount.cardHolderName}\n` +
        `بانک: ${activeAccount.bankName}\n` +
        notesLine +
        `\nلطفاً مبلغ دقیق ریالی را به حساب بانکی فوق واریز نمایید. پس از واریز، عکس رسید پرداخت خود را ارسال کنید.`
      );
    } catch (err: any) {
      if (err instanceof ActiveTopUpRequestExistsError) {
        await ctx.reply(
          'شما یک درخواست افزایش موجودی فعال دارید. لطفاً قبل از ثبت درخواست جدید، درخواست قبلی را تکمیل یا لغو کنید.'
        );
        return;
      }
      if (err instanceof NoExchangeRateError || err instanceof NoActiveBankAccountError) {
        await ctx.reply('افزایش موجودی موقتاً در دسترس نیست. لطفاً بعداً تلاش کنید.');
        return;
      }
      throw err;
    }
  };
}
