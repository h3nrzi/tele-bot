import type { Context } from 'grammy';
import type { WalletService } from '@/modules/wallet/wallet.service';
import { formatUsd } from '@/core/shared/currency.utils';
import { getBuyerWalletMenuKeyboard } from '@/bot/keyboards/menu.keyboards';

/**
 * Handles the /balance command and menu button.
 */
export async function handleBalance(
  ctx: Context,
  walletService: WalletService
): Promise<void> {
  const sender = ctx.from;
  if (!sender) {
    return;
  }

  const result = await walletService.getBuyerWallet({
    telegramChatId: sender.id,
  });

  if (!result) {
    await ctx.reply(
      'شما هنوز در ربات ثبت نام نکرده‌اید. لطفاً با ارسال /start ثبت نام خود را انجام دهید.'
    );
    return;
  }

  await ctx.reply(`💰 موجودی کیف پول شما: ${formatUsd(result.wallet.availableBalance)}`, {
    reply_markup: getBuyerWalletMenuKeyboard(),
  });
}
