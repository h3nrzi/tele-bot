import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import type { CatalogService } from '@/modules/catalog/catalog.service';
import type { BuyerService } from '@/modules/buyer/buyer.service';
import {
  buildShopView,
  buildOrderConfirmationView,
} from '@/bot/handlers/buyer/shop.keyboards';

export interface ShopItemDependencies {
  catalogService: CatalogService;
  buyerService: BuyerService;
}

/**
 * Handles the /shop Buyer command and menu button.
 * Lists all active Catalog Items as an inline keyboard.
 */
export async function handleShopCommand(
  ctx: Context,
  catalogService: CatalogService
): Promise<void> {
  const sender = ctx.from;
  if (!sender) {
    return;
  }

  const items = await catalogService.listActive();
  const { messageText, keyboard } = buildShopView(items);

  await ctx.reply(messageText, {
    reply_markup: keyboard,
  });
}

/**
 * Handles tapping a Catalog Item button (shop:item:<id>).
 * Renders the order confirmation prompt or insufficient-balance error prompt.
 */
export async function handleShopItemCallback(
  ctx: Context,
  deps: ShopItemDependencies
): Promise<void> {
  const sender = ctx.from;
  if (!sender) {
    return;
  }

  const callbackData = ctx.callbackQuery?.data;
  const match = callbackData?.match(/^shop:item:(.+)$/);
  if (!match || !match[1]) {
    return;
  }

  const itemId = match[1];
  const { catalogService, buyerService } = deps;

  const item = await catalogService.findById(itemId);
  if (!item || !item.isActive) {
    try {
      await ctx.answerCallbackQuery({
        text: '⚠️ این خدمت در دسترس نیست یا غیرفعال شده است.',
        show_alert: true,
      });
    } catch {}
    return;
  }

  // Ensure buyer is registered and obtain latest wallet balance
  const { wallet } = await buyerService.register({
    telegramChatId: sender.id,
    telegramUsername: sender.username ?? null,
  });

  const { messageText, keyboard } = buildOrderConfirmationView(
    item,
    wallet.availableBalance
  );

  try {
    await ctx.editMessageText(messageText, {
      reply_markup: keyboard,
    });
  } catch {
    await ctx.reply(messageText, {
      reply_markup: keyboard,
    });
  }

  try {
    await ctx.answerCallbackQuery();
  } catch {}
}

/**
 * Handles tapping the [✗ Cancel] button on the confirmation prompt (shop:cancel).
 * Dismisses the prompt without side effects.
 */
export async function handleShopCancelCallback(ctx: Context): Promise<void> {
  try {
    await ctx.editMessageText('❌ عملیات خرید لغو شد.', {
      reply_markup: new InlineKeyboard(),
    });
  } catch {}

  try {
    await ctx.answerCallbackQuery({ text: 'عملیات لغو شد.' });
  } catch {}
}

/**
 * Stub callback handler for [✓ Confirm] button (shop:confirm:<id>).
 * Activated in Ticket 04.
 */
export async function handleShopConfirmCallback(ctx: Context): Promise<void> {
  try {
    await ctx.answerCallbackQuery({
      text: 'ثبت سفارش به زودی در فاز بعدی فعال می‌شود.',
      show_alert: true,
    });
  } catch {}
}
