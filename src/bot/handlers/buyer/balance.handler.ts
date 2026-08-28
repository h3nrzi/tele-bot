import type { Context } from 'grammy';
import { WalletService } from '@/modules/wallet/wallet.service';
import type { DbClient } from '@/core/database/client';
import { createAppContainer } from '@/core/di/container';
import {
  getBuyerBalanceMessage,
  getUnregisteredBalanceMessage,
} from '@/bot/handlers/buyer/balance.messages';

/**
 * Handles the /balance command and menu button.
 */
export async function handleBalance(
  ctx: Context,
  walletServiceOrDb?: WalletService | DbClient
): Promise<void> {
  const sender = ctx.from;
  if (!sender) {
    return;
  }

  const walletService =
    walletServiceOrDb instanceof WalletService
      ? walletServiceOrDb
      : createAppContainer({ dbClient: walletServiceOrDb, child: true }).resolve(WalletService);

  const result = await walletService.getBuyerWallet({
    telegramChatId: sender.id,
  });

  if (!result) {
    await ctx.reply(getUnregisteredBalanceMessage());
    return;
  }

  await ctx.reply(getBuyerBalanceMessage(result.wallet.availableBalance));
}
