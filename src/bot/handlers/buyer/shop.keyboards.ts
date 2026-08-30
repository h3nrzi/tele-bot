import { InlineKeyboard } from 'grammy';
import Decimal from 'decimal.js';
import type { CatalogItem } from '@/modules/catalog/catalog.entity';
import { formatUsd } from '@/core/shared/currency.utils';
import type { UsdAmount } from '@/core/shared/money.vo';

export interface ShopView {
  messageText: string;
  keyboard: InlineKeyboard;
}

export interface OrderConfirmationView {
  messageText: string;
  keyboard: InlineKeyboard;
  hasSufficientBalance: boolean;
}

/**
 * Builds the /shop catalog view displaying all active Catalog Items as inline buttons.
 */
export function buildShopView(items: CatalogItem[]): ShopView {
  if (items.length === 0) {
    return {
      messageText: '🛍️ فروشگاه خدمات\n\nدر حال حاضر هیچ خدمتی برای خرید موجود نیست.',
      keyboard: new InlineKeyboard(),
    };
  }

  const keyboard = new InlineKeyboard();
  for (const item of items) {
    keyboard
      .text(`${item.name} - ${formatUsd(item.usdPrice)}`, `shop:item:${item.id}`)
      .row();
  }

  const messageText =
    `🛍️ فروشگاه خدمات\n\n` +
    `لطفاً خدمت مورد نظر خود را برای خرید انتخاب کنید:`;

  return { messageText, keyboard };
}

/**
 * Builds the Order Confirmation Prompt view for a selected Catalog Item.
 * If Available Balance >= price, includes [✓ Confirm] and [✗ Cancel].
 * If Available Balance < price, shows insufficient-balance error and omits [✓ Confirm].
 */
export function buildOrderConfirmationView(
  item: CatalogItem,
  availableBalance: string | Decimal | UsdAmount
): OrderConfirmationView {
  const balanceDec =
    typeof availableBalance === 'string'
      ? new Decimal(availableBalance)
      : availableBalance instanceof Decimal
        ? availableBalance
        : new Decimal(availableBalance.toString());

  const priceDec = new Decimal(item.usdPrice);
  const hasSufficientBalance = balanceDec.gte(priceDec);

  const descriptionLine = item.description ? `📝 توضیحات: ${item.description}\n` : '';
  const baseInvoiceDetails =
    `🛒 پیش‌فاکتور خرید خدمت\n\n` +
    `📦 نام خدمت: ${item.name}\n` +
    descriptionLine +
    `💵 قیمت: ${formatUsd(item.usdPrice)}\n` +
    `💰 موجودی کیف پول شما: ${formatUsd(availableBalance)}\n\n`;

  if (hasSufficientBalance) {
    const messageText =
      baseInvoiceDetails +
      `آیا از ثبت این سفارش اطمینان دارید؟`;

    const keyboard = new InlineKeyboard()
      .text('✓ تایید خرید', `shop:confirm:${item.id}`)
      .text('✗ انصراف', 'shop:cancel');

    return { messageText, keyboard, hasSufficientBalance };
  }

  const messageText =
    baseInvoiceDetails +
    `⚠️ موجودی کیف پول شما برای خرید این خدمت کافی نیست. لطفاً ابتدا از طریق دستور /topup موجودی خود را افزایش دهید.`;

  const keyboard = new InlineKeyboard().text('✗ انصراف', 'shop:cancel');

  return { messageText, keyboard, hasSufficientBalance };
}
