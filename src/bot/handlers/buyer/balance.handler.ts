import type { Context } from 'grammy';
import type { WalletService } from '@/modules/wallet/wallet.service';
import {
  getBuyerBalanceMessage,
  getUnregisteredBalanceMessage,
} from '@/bot/handlers/buyer/balance.messages';

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
    await ctx.reply(getUnregisteredBalanceMessage());
    return;
  }

  await ctx.reply(getBuyerBalanceMessage(result.wallet.availableBalance));
}
