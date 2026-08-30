import type { Context } from 'grammy';
import Decimal from 'decimal.js';
import type { BotConversation } from '@/bot/context';
import type { CatalogService } from '@/modules/catalog/catalog.service';
import { isCancelCommand as isCancelUtil } from '@/core/shared/telegram.utils';
import {
  getCatalogDashboardKeyboard,
  getSkipInlineKeyboard,
  getKeepInlineKeyboard,
  getConfirmationInlineKeyboard,
  type CatalogItemViewData,
} from '@/bot/handlers/admin/catalog.keyboards';
import type { CatalogItem } from '@/modules/catalog/catalog.entity';

export type AddCatalogItemConversation = BotConversation;
export type EditCatalogItemConversation = BotConversation;

export const ADD_CATALOG_ITEM_CONVERSATION_ID = 'add_catalog_item';
export const EDIT_CATALOG_ITEM_CONVERSATION_ID = 'edit_catalog_item';

/**
 * Checks if input is a cancel command.
 */
export function isCancelCommand(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  return (
    trimmed === 'لغو' ||
    trimmed === 'انصراف' ||
    isCancelUtil(trimmed)
  );
}

/**
 * Checks if input is a skip command for optional fields.
 */
export function isSkipCommand(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  return (
    trimmed === '-' ||
    trimmed === 'skip' ||
    trimmed === 'رد' ||
    trimmed.startsWith('/skip') ||
    trimmed === ''
  );
}

/**
 * Checks if input is a keep command to preserve existing value during edit.
 */
export function isKeepCommand(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  return (
    trimmed === '-' ||
    trimmed === 'keep' ||
    trimmed === 'حفظ' ||
    trimmed.startsWith('/keep')
  );
}

/**
 * Checks if input is a confirmation response (yes / confirm).
 */
export function isConfirmCommand(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  return (
    trimmed === 'yes' ||
    trimmed === 'y' ||
    trimmed === 'بله' ||
    trimmed === 'تایید' ||
    trimmed === 'تأیید' ||
    trimmed === 'ok' ||
    trimmed === 'confirm' ||
    trimmed.startsWith('/confirm')
  );
}

/**
 * Parses and validates a user USD price string. Returns formatted 2-decimal string or null if invalid.
 */
export function parseUsdInput(text: string): string | null {
  const cleanStr = text.trim().replace(/^\$/, '');
  try {
    const dec = new Decimal(cleanStr);
    if (!dec.isNaN() && dec.gt(0)) {
      return dec.toFixed(2);
    }
  } catch {}
  return null;
}

/**
 * Helper to build dashboard view message text and keyboard.
 */
export function buildCatalogDashboardView(
  items: (CatalogItem | CatalogItemViewData)[]
): {
  messageText: string;
  keyboard: ReturnType<typeof getCatalogDashboardKeyboard>;
} {
  if (items.length === 0) {
    return {
      messageText:
        '📦 کاتالوگ خدمات\n\n' +
        'هیچ خدمتی در کاتالوگ ثبت نشده است.\n' +
        'برای افزودن اولین خدمت از دکمه زیر استفاده کنید:',
      keyboard: getCatalogDashboardKeyboard([]),
    };
  }

  const lines = items.map((item, index) => {
    const statusIndicator = item.isActive ? '🟢 فعال' : '🔴 غیرفعال';
    const descLine = item.description ? `\n   📝 ${item.description}` : '';
    return (
      `${index + 1}. [${statusIndicator}] ${item.name}\n` +
      `   💰 قیمت: $${item.usdPrice}` +
      descLine
    );
  });

  const messageText =
    `📦 کاتالوگ خدمات (مجموع: ${items.length} خدمت)\n\n` +
    lines.join('\n\n') +
    '\n\nبرای ویرایش یا تغییر وضعیت هر خدمت از دکمه‌های زیر استفاده کنید:';

  return {
    messageText,
    keyboard: getCatalogDashboardKeyboard(items),
  };
}

/**
 * Fetches the full catalog and renders the dashboard reply.
 */
async function refreshAndSendDashboard(
  conversation: BotConversation,
  catalogService: CatalogService,
  ctx: Context
): Promise<void> {
  const allItems = await conversation.external(async () => {
    const list = await catalogService.listAll();
    return list.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      usdPrice: item.usdPrice,
      isActive: item.isActive,
    }));
  });

  const { messageText, keyboard } = buildCatalogDashboardView(allItems);
  await ctx.reply(messageText, { reply_markup: keyboard });
}

/**
 * Creates the grammY conversation for Admin adding a new Catalog Item.
 * Flow: prompt name -> description (with [Skip] option) -> price -> confirmation -> create & refresh dashboard.
 */
export function createAddCatalogItemConversation(catalogService: CatalogService) {
  return async function addCatalogItem(
    conversation: AddCatalogItemConversation,
    ctx: Context
  ): Promise<void> {
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCallbackQuery();
      } catch {}
    }

    // Step 1: Prompt Name
    await ctx.reply(
      '📦 افزودن خدمت جدید\n\nلطفاً نام خدمت را وارد کنید (یا /cancel برای انصراف):'
    );

    let name = '';
    while (true) {
      const nameCtx = await conversation.wait();
      const text = nameCtx.message?.text ?? '';
      const callbackData = nameCtx.callbackQuery?.data;

      if (callbackData === 'flow:cancel' || isCancelCommand(text)) {
        if (nameCtx.callbackQuery) {
          try {
            await nameCtx.answerCallbackQuery();
          } catch {}
        }
        await nameCtx.reply('❌ عملیات افزودن خدمت جدید لغو شد.');
        return;
      }

      if (text.trim().length > 0) {
        name = text.trim();
        break;
      }

      await nameCtx.reply(
        '❌ نام خدمت نمی‌تواند خالی باشد. لطفاً نام خدمت را وارد کنید (یا /cancel برای انصراف):'
      );
    }

    // Step 2: Prompt Description (with [Skip] button)
    await ctx.reply(
      'لطفاً توضیحات خدمت را وارد کنید (یا دکمه [رد شدن] را بزنید):',
      {
        reply_markup: getSkipInlineKeyboard(),
      }
    );

    const descCtx = await conversation.wait();
    const descText = descCtx.message?.text ?? '';
    const descCallback = descCtx.callbackQuery?.data;

    if (descCallback === 'flow:cancel' || isCancelCommand(descText)) {
      if (descCtx.callbackQuery) {
        try {
          await descCtx.answerCallbackQuery();
        } catch {}
      }
      await descCtx.reply('❌ عملیات افزودن خدمت جدید لغو شد.');
      return;
    }

    let description: string | null = null;
    if (descCallback === 'flow:skip' || isSkipCommand(descText)) {
      if (descCtx.callbackQuery) {
        try {
          await descCtx.answerCallbackQuery();
        } catch {}
      }
      description = null;
    } else {
      description = descText.trim() || null;
    }

    // Step 3: Prompt USD Price
    await ctx.reply(
      'لطفاً قیمت خدمت به دلار ($) را وارد کنید (مثال: 15.00، یا /cancel برای انصراف):'
    );

    let usdPrice = '';
    while (true) {
      const priceCtx = await conversation.wait();
      const priceText = priceCtx.message?.text ?? '';
      const priceCallback = priceCtx.callbackQuery?.data;

      if (priceCallback === 'flow:cancel' || isCancelCommand(priceText)) {
        if (priceCtx.callbackQuery) {
          try {
            await priceCtx.answerCallbackQuery();
          } catch {}
        }
        await priceCtx.reply('❌ عملیات افزودن خدمت جدید لغو شد.');
        return;
      }

      const parsedPrice = parseUsdInput(priceText);
      if (parsedPrice !== null) {
        usdPrice = parsedPrice;
        break;
      }

      await priceCtx.reply(
        '❌ قیمت وارد شده نامعتبر است. لطفاً یک عدد مثبت به دلار وارد کنید (مثال: 15.00، یا /cancel برای انصراف):'
      );
    }

    // Step 4: Confirmation (with inline buttons)
    const descLine = description ? `\n📝 توضیحات: ${description}` : '\n📝 توضیحات: ندارد';
    await ctx.reply(
      `📋 پیش‌نمایش خدمت جدید:\n\n` +
      `🏷 نام: ${name}` +
      descLine +
      `\n💰 قیمت: $${usdPrice}\n\n` +
      `آیا اطلاعات فوق را تایید می‌کنید؟`,
      {
        reply_markup: getConfirmationInlineKeyboard(),
      }
    );

    const confirmCtx = await conversation.wait();
    const confirmText = confirmCtx.message?.text ?? '';
    const confirmCallback = confirmCtx.callbackQuery?.data;

    if (
      confirmCallback === 'flow:cancel' ||
      isCancelCommand(confirmText) ||
      (confirmCallback !== 'flow:confirm' && !isConfirmCommand(confirmText))
    ) {
      if (confirmCtx.callbackQuery) {
        try {
          await confirmCtx.answerCallbackQuery();
        } catch {}
      }
      await confirmCtx.reply('❌ عملیات افزودن خدمت جدید لغو شد.');
      return;
    }

    if (confirmCtx.callbackQuery) {
      try {
        await confirmCtx.answerCallbackQuery();
      } catch {}
    }

    // Step 5: Save & Refresh
    const createdItem = await conversation.external(async () => {
      const item = await catalogService.createCatalogItem({
        name,
        description,
        usdPrice,
      });
      return {
        id: item.id,
        name: item.name,
        description: item.description,
        usdPrice: item.usdPrice,
        isActive: item.isActive,
      };
    });

    await confirmCtx.reply(
      `✅ خدمت «${createdItem.name}» با موفقیت ایجاد شد!\n\nقیمت: $${createdItem.usdPrice}`
    );

    await refreshAndSendDashboard(conversation, catalogService, confirmCtx);
  };
}

/**
 * Creates the grammY conversation for Admin editing an existing Catalog Item.
 * Flow: prompt each field in sequence (pre-filled with current value), allow [Keep] to skip unchanged fields, update & refresh dashboard.
 */
export function createEditCatalogItemConversation(catalogService: CatalogService) {
  return async function editCatalogItem(
    conversation: EditCatalogItemConversation,
    ctx: Context
  ): Promise<void> {
    const callbackData = ctx.callbackQuery?.data;
    const match = callbackData?.match(/^catalog:edit:(.+)$/);

    if (ctx.callbackQuery) {
      try {
        await ctx.answerCallbackQuery();
      } catch {}
    }

    if (!match || !match[1]) {
      await ctx.reply('⚠️ شناسه خدمت نامعتبر است.');
      return;
    }

    const itemId = match[1];

    const currentItem = await conversation.external(async () => {
      const item = await catalogService.findById(itemId);
      if (!item) {
        return null;
      }
      return {
        id: item.id,
        name: item.name,
        description: item.description,
        usdPrice: item.usdPrice,
        isActive: item.isActive,
      };
    });

    if (!currentItem) {
      await ctx.reply('⚠️ خدمت مورد نظر در سیستم یافت نشد.');
      return;
    }

    // Step 1: Edit Name (with [Keep] button)
    await ctx.reply(
      `✏️ ویرایش خدمت «${currentItem.name}»\n\n` +
      `نام فعلی: ${currentItem.name}\n` +
      `لطفاً نام جدید را وارد کنید (یا دکمه [حفظ مقدار فعلی] را بزنید):`,
      {
        reply_markup: getKeepInlineKeyboard(),
      }
    );

    let newName: string | undefined;
    while (true) {
      const nameCtx = await conversation.wait();
      const text = nameCtx.message?.text ?? '';
      const cb = nameCtx.callbackQuery?.data;

      if (cb === 'flow:cancel' || isCancelCommand(text)) {
        if (nameCtx.callbackQuery) {
          try {
            await nameCtx.answerCallbackQuery();
          } catch {}
        }
        await nameCtx.reply('❌ عملیات ویرایش خدمت لغو شد.');
        return;
      }

      if (cb === 'flow:keep' || isKeepCommand(text)) {
        if (nameCtx.callbackQuery) {
          try {
            await nameCtx.answerCallbackQuery();
          } catch {}
        }
        newName = undefined; // Keep current
        break;
      }

      if (text.trim().length > 0) {
        newName = text.trim();
        break;
      }

      await nameCtx.reply(
        '❌ نام خدمت نمی‌تواند خالی باشد. لطفاً نام جدید را وارد کنید (یا دکمه [حفظ مقدار فعلی] را بزنید):',
        {
          reply_markup: getKeepInlineKeyboard(),
        }
      );
    }

    // Step 2: Edit Description (with [Keep] and [Skip] buttons)
    const currentDesc = currentItem.description ?? 'ندارد';
    await ctx.reply(
      `توضیحات فعلی: ${currentDesc}\n` +
      `لطفاً توضیحات جدید را وارد کنید (یا از دکمه‌های زیر استفاده کنید):`,
      {
        reply_markup: getKeepInlineKeyboard(true),
      }
    );

    const descCtx = await conversation.wait();
    const descText = descCtx.message?.text ?? '';
    const descCb = descCtx.callbackQuery?.data;

    if (descCb === 'flow:cancel' || isCancelCommand(descText)) {
      if (descCtx.callbackQuery) {
        try {
          await descCtx.answerCallbackQuery();
        } catch {}
      }
      await descCtx.reply('❌ عملیات ویرایش خدمت لغو شد.');
      return;
    }

    let newDescription: string | null | undefined;
    if (descCb === 'flow:keep' || isKeepCommand(descText)) {
      if (descCtx.callbackQuery) {
        try {
          await descCtx.answerCallbackQuery();
        } catch {}
      }
      newDescription = undefined; // Keep current
    } else if (descCb === 'flow:skip' || isSkipCommand(descText)) {
      if (descCtx.callbackQuery) {
        try {
          await descCtx.answerCallbackQuery();
        } catch {}
      }
      newDescription = null; // Clear description
    } else {
      newDescription = descText.trim() || null;
    }

    // Step 3: Edit USD Price (with [Keep] button)
    await ctx.reply(
      `قیمت فعلی: $${currentItem.usdPrice}\n` +
      `لطفاً قیمت جدید را به دلار ($) وارد کنید (یا دکمه [حفظ مقدار فعلی] را بزنید):`,
      {
        reply_markup: getKeepInlineKeyboard(),
      }
    );

    let newPrice: string | undefined;
    while (true) {
      const priceCtx = await conversation.wait();
      const priceText = priceCtx.message?.text ?? '';
      const priceCb = priceCtx.callbackQuery?.data;

      if (priceCb === 'flow:cancel' || isCancelCommand(priceText)) {
        if (priceCtx.callbackQuery) {
          try {
            await priceCtx.answerCallbackQuery();
          } catch {}
        }
        await priceCtx.reply('❌ عملیات ویرایش خدمت لغو شد.');
        return;
      }

      if (priceCb === 'flow:keep' || isKeepCommand(priceText)) {
        if (priceCtx.callbackQuery) {
          try {
            await priceCtx.answerCallbackQuery();
          } catch {}
        }
        newPrice = undefined; // Keep current
        break;
      }

      const parsedPrice = parseUsdInput(priceText);
      if (parsedPrice !== null) {
        newPrice = parsedPrice;
        break;
      }

      await priceCtx.reply(
        '❌ قیمت وارد شده نامعتبر است. لطفاً یک عدد مثبت به دلار وارد کنید (یا دکمه [حفظ مقدار فعلی] را بزنید):',
        {
          reply_markup: getKeepInlineKeyboard(),
        }
      );
    }

    // Step 4: Execute update
    const updated = await conversation.external(async () => {
      const item = await catalogService.editCatalogItem(itemId, {
        name: newName,
        description: newDescription,
        usdPrice: newPrice,
      });
      return {
        id: item.id,
        name: item.name,
        description: item.description,
        usdPrice: item.usdPrice,
        isActive: item.isActive,
      };
    });

    await ctx.reply(
      `✅ خدمت «${updated.name}» با موفقیت به‌روزرسانی شد!\n\nقیمت: $${updated.usdPrice}`
    );

    await refreshAndSendDashboard(conversation, catalogService, ctx);
  };
}
