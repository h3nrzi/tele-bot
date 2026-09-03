import type { Context } from 'grammy';
import type { CatalogService } from '@/modules/catalog/catalog.service';
import { isAdmin } from '@/bot/middleware/admin.middleware';
import {
  buildCatalogDashboardView,
  ADD_CATALOG_ITEM_CONVERSATION_ID,
  EDIT_CATALOG_ITEM_CONVERSATION_ID,
} from '@/bot/handlers/admin/catalog.conversation';
import type { BotContext } from '@/bot/context';

export interface CatalogHandlerOptions {
  adminIds?: string | Set<bigint> | undefined;
}

/**
 * Handles the /catalog Admin command.
 * Restricted to Admins; non-Admins receive an access-denied message.
 */
export async function handleCatalogCommand(
  ctx: Context,
  catalogService: CatalogService,
  options?: CatalogHandlerOptions
): Promise<void> {
  const senderId = ctx.from?.id;

  if (!isAdmin(senderId, options?.adminIds)) {
    await ctx.reply('⛔ دسترسی غیرمجاز. این دستور فقط برای مدیران سیستم قابل استفاده است.');
    return;
  }

  const items = await catalogService.listAll();
  const { messageText, keyboard } = buildCatalogDashboardView(items);

  await ctx.reply(messageText, {
    reply_markup: keyboard,
  });
}

/**
 * Handles toggling a Catalog Item's is_active status immediately and refreshing the dashboard.
 */
export async function handleCatalogToggleCallback(
  ctx: Context,
  catalogService: CatalogService
): Promise<void> {
  const callbackData = ctx.callbackQuery?.data;
  const match = callbackData?.match(/^catalog:toggle:(.+)$/);

  if (!match || !match[1]) {
    try {
      await ctx.answerCallbackQuery({ text: '⚠️ شناسه نامعتبر است.', show_alert: true });
    } catch {}
    return;
  }

  const itemId = match[1];

  try {
    const updated = await catalogService.toggleActive(itemId);

    try {
      await ctx.answerCallbackQuery({
        text: updated.isActive ? '🟢 خدمت فعال شد.' : '🔴 خدمت غیرفعال شد.',
      });
    } catch {}

    const allItems = await catalogService.listAll();
    const { messageText, keyboard } = buildCatalogDashboardView(allItems);

    try {
      await ctx.editMessageText(messageText, {
        reply_markup: keyboard,
      });
    } catch (editErr) {
      console.error('Failed to edit catalog dashboard:', editErr);
    }
  } catch (err) {
    console.error('Failed to toggle catalog item status:', err);
    try {
      await ctx.answerCallbackQuery({ text: '❌ خطا در تغییر وضعیت خدمت.', show_alert: true });
    } catch {}
  }
}

/**
 * Handles the [+ Add New] callback query by entering the add catalog conversation.
 */
export async function handleCatalogAddCallback(ctx: BotContext): Promise<void> {
  await ctx.conversation.enter(ADD_CATALOG_ITEM_CONVERSATION_ID);
}

/**
 * Handles the [Edit] callback query by entering the edit catalog conversation.
 */
export async function handleCatalogEditCallback(ctx: BotContext): Promise<void> {
  await ctx.conversation.enter(EDIT_CATALOG_ITEM_CONVERSATION_ID);
}
