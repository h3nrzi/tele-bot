import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import type { CatalogService } from '@/modules/catalog/catalog.service';
import type { BuyerService } from '@/modules/buyer/buyer.service';
import type { OrderService } from '@/modules/order/order.service';
import {
  buildShopView,
  buildOrderConfirmationView,
} from '@/bot/handlers/buyer/shop.keyboards';
import { getAdminOrderNotificationKeyboard } from '@/bot/handlers/admin/order.keyboards';
import { resolveAdminIds } from '@/bot/middleware/admin.middleware';
import { formatUsd } from '@/core/shared/currency.utils';
import {
  InsufficientBalanceForOrderError,
  CatalogItemUnavailableError,
} from '@/modules/order/order.errors';
import type { OrderAdminNotificationPayload } from '@/modules/order/dtos/order.dto';

export interface ShopItemDependencies {
  catalogService: CatalogService;
  buyerService: BuyerService;
}

export interface ShopConfirmDependencies {
  orderService: OrderService;
  buyerService?: BuyerService | undefined;
  adminIds?: string | Set<bigint> | undefined;
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
 * Handles tapping the [✓ Confirm] button on the confirmation prompt (shop:confirm:<id>).
 * Atomically places an Order, debits wallet balance, writes ledger transactions,
 * confirms to Buyer, and dispatches push notifications to configured Admins.
 */
export async function handleShopConfirmCallback(
  ctx: Context,
  deps: ShopConfirmDependencies
): Promise<void> {
  const sender = ctx.from;
  if (!sender) {
    return;
  }

  const callbackData = ctx.callbackQuery?.data;
  const match = callbackData?.match(/^shop:confirm:(.+)$/);
  if (!match || !match[1]) {
    return;
  }

  const itemId = match[1];
  const { orderService, adminIds } = deps;

  try {
    const result = await orderService.placeOrder(
      {
        telegramChatId: sender.id,
        catalogItemId: itemId,
      },
      {
        notifyAdmins: async (context) => {
          const resolvedAdminIds = resolveAdminIds(adminIds);
          const buyerDisplay = context.buyer.telegramUsername
            ? `@${context.buyer.telegramUsername} (شناسه: ${context.buyer.telegramChatId})`
            : `شناسه: ${context.buyer.telegramChatId}`;
          const descriptionLine = context.catalogItem.description
            ? `\n📝 توضیحات: ${context.catalogItem.description}`
            : '';

          const adminMessage =
            `📦 سفارش جدید ثبت شد\n\n` +
            `🆔 شناسه سفارش: #${context.order.id}\n` +
            `👤 خریدار: ${buyerDisplay}\n` +
            `🛍️ نام خدمت: ${context.catalogItem.name}` +
            descriptionLine +
            `\n💵 مبلغ سفارش: ${formatUsd(context.order.usdPriceSnapshot)}\n` +
            `💰 موجودی باقی‌مانده خریدار: ${formatUsd(context.postDebitBalance)}`;

          const keyboard = getAdminOrderNotificationKeyboard(context.order.id);
          const notificationPayloads: OrderAdminNotificationPayload[] = [];

          for (const adminId of resolvedAdminIds) {
            try {
              const sentMessage = await ctx.api.sendMessage(
                Number(adminId),
                adminMessage,
                {
                  reply_markup: keyboard,
                }
              );
              notificationPayloads.push({
                adminTelegramId: adminId,
                chatId: BigInt(sentMessage.chat.id),
                messageId: BigInt(sentMessage.message_id),
              });
            } catch (err) {
              console.error(
                `Failed to send order notification to admin ${adminId}:`,
                err
              );
            }
          }

          return notificationPayloads;
        },
      }
    );

    const buyerSuccessMessage =
      `✅ سفارش شما با موفقیت ثبت شد!\n\n` +
      `🆔 شناسه سفارش: #${result.order.id}\n` +
      `🛍️ خدمت: ${result.catalogItem.name}\n` +
      `💵 مبلغ کسر شده: ${formatUsd(result.order.usdPriceSnapshot)}\n` +
      `💰 موجودی باقی‌مانده: ${formatUsd(result.wallet.availableBalance)}\n\n` +
      `سفارش شما در صف بررسی ادمین‌ها قرار گرفت. مشخصات تحویل پس از پردازش از طریق همین ربات برای شما ارسال خواهد شد.`;

    try {
      await ctx.editMessageText(buyerSuccessMessage, {
        reply_markup: new InlineKeyboard(),
      });
    } catch {
      await ctx.reply(buyerSuccessMessage);
    }

    try {
      await ctx.answerCallbackQuery({
        text: '✅ سفارش با موفقیت ثبت شد.',
      });
    } catch {}
  } catch (err: any) {
    if (err instanceof InsufficientBalanceForOrderError) {
      try {
        await ctx.editMessageText(
          '⚠️ موجودی کیف پول شما برای خرید این خدمت کافی نیست. لطفاً ابتدا از طریق دستور /topup موجودی خود را افزایش دهید.',
          {
            reply_markup: new InlineKeyboard().text('✗ انصراف', 'shop:cancel'),
          }
        );
      } catch {}

      try {
        await ctx.answerCallbackQuery({
          text: '⚠️ موجودی کیف پول شما برای ثبت این سفارش کافی نیست. لطفاً ابتدا موجودی خود را افزایش دهید.',
          show_alert: true,
        });
      } catch {}
      return;
    }

    if (err instanceof CatalogItemUnavailableError) {
      try {
        await ctx.editMessageText(
          '⚠️ این خدمت دیگر در دسترس نیست یا غیرفعال شده است.',
          {
            reply_markup: new InlineKeyboard().text('✗ انصراف', 'shop:cancel'),
          }
        );
      } catch {}

      try {
        await ctx.answerCallbackQuery({
          text: '⚠️ این خدمت دیگر در دسترس نیست یا غیرفعال شده است.',
          show_alert: true,
        });
      } catch {}
      return;
    }

    throw err;
  }
}
