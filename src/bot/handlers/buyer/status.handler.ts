import type { Context } from 'grammy';
import type { TopUpService } from '@/modules/top-up/top-up.service';
import type { BuyerService } from '@/modules/buyer/buyer.service';
import type { TopUpStatus } from '@/modules/top-up/top-up-request.entity';
import { formatUsd, formatIrr } from '@/core/shared/currency.utils';
import { getBuyerMainMenuKeyboard } from '@/bot/keyboards/menu.keyboards';

export interface StatusHandlerDependencies {
  buyerService: BuyerService;
  topUpService: TopUpService;
}

const STATUS_LABELS: Record<TopUpStatus, string> = {
  INITIATED: 'در انتظار پرداخت',
  PENDING: 'در انتظار بررسی ادمین',
  APPROVED: 'تایید شده',
  REJECTED: 'رد شده',
  EXPIRED: 'منقضی شده',
  CANCELLED: 'لغو شده',
};

/**
 * Handles the /status command.
 */
export async function handleStatusCommand(
  ctx: Context,
  deps: StatusHandlerDependencies
): Promise<void> {
  const sender = ctx.from;
  if (!sender) {
    return;
  }

  const { buyerService, topUpService } = deps;

  const buyer = await buyerService.findByTelegramChatId(sender.id);
  if (!buyer) {
    return;
  }

  const latestRequest = await topUpService.getLatestTopUpRequest(buyer.id);
  if (!latestRequest) {
    await ctx.reply('شما تاکنون هیچ درخواست افزایش موجودی ثبت نکرده‌اید.', {
      reply_markup: getBuyerMainMenuKeyboard(),
    });
    return;
  }

  const statusLabel = STATUS_LABELS[latestRequest.status];
  const dateFormatted = latestRequest.createdAt.toISOString();

  let message =
    `📊 وضعیت آخرین درخواست افزایش موجودی:\n\n` +
    `وضعیت: ${statusLabel}\n` +
    `مبلغ: ${formatUsd(latestRequest.usdAmount)}\n` +
    `مبلغ ریالی: ${formatIrr(latestRequest.irrAmount)} ریال\n` +
    `تاریخ ثبت: ${dateFormatted}`;

  if (latestRequest.status === 'REJECTED' && latestRequest.rejectionReason) {
    message += `\nعلت رد درخواست: ${latestRequest.rejectionReason}`;
  }

  await ctx.reply(message, {
    reply_markup: getBuyerMainMenuKeyboard(),
  });
}
