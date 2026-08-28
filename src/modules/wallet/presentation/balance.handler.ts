import type { Context } from 'grammy';
import type { WalletService } from '@/modules/wallet/wallet.service';
import {
  getBalanceMessage,
  getUnregisteredBalanceMessage,
} from '@/modules/wallet/presentation/balance.messages';
import { getBuyerMainMenuKeyboard } from '@/core/bot/keyboards/menu.keyboards';

/**
 * Handles the /balance command.
 * - For a registered Buyer: returns their current Available Balance.
 * - For an unregistered sender: prompts them to send /start first.
 * - For updates without sender info (ctx.from undefined): silently ignores.
 */
export async function handleBalance(
  ctx: Context,
  walletService: WalletService
): Promise<void> {
  if (!ctx.from) {
    return;
  }

  const result = await walletService.getBuyerWallet({
    telegramChatId: ctx.from.id,
  });

  if (!result) {
    await ctx.reply(getUnregisteredBalanceMessage());
    return;
  }

  await ctx.reply(getBalanceMessage(result.wallet.availableBalance), {
    reply_markup: getBuyerMainMenuKeyboard(),
  });
}
