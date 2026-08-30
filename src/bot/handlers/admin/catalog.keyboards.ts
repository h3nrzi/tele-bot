import { InlineKeyboard } from 'grammy';
import type { CatalogItem } from '@/modules/catalog/catalog.entity';

export interface CatalogItemViewData {
  id: string;
  name: string;
  description?: string | null | undefined;
  usdPrice: string;
  isActive: boolean;
}

/**
 * Builds the inline keyboard for the Admin Catalog dashboard.
 * - Each item row has [Edit] and [Deactivate] / [Reactivate] buttons.
 * - [+ Add New] button at the bottom.
 */
export function getCatalogDashboardKeyboard(
  items: (CatalogItem | CatalogItemViewData)[]
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const item of items) {
    const toggleLabel = item.isActive ? '🔴 غیرفعال‌سازی' : '🟢 فعال‌سازی';
    keyboard
      .text('✏️ ویرایش', `catalog:edit:${item.id}`)
      .text(toggleLabel, `catalog:toggle:${item.id}`)
      .row();
  }

  keyboard.text('➕ افزودن خدمت جدید', 'catalog:add');

  return keyboard;
}

/**
 * Inline keyboard with [Skip] and [Cancel] buttons for optional fields.
 */
export function getSkipInlineKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('⏭ رد شدن (بدون توضیحات)', 'flow:skip')
    .row()
    .text('❌ انصراف', 'flow:cancel');
}

/**
 * Inline keyboard with [Keep] and [Cancel] buttons for editing.
 */
export function getKeepInlineKeyboard(includeSkip = false): InlineKeyboard {
  const keyboard = new InlineKeyboard().text('حفظ مقدار فعلی', 'flow:keep');
  if (includeSkip) {
    keyboard.text('حذف توضیحات', 'flow:skip');
  }
  keyboard.row().text('❌ انصراف', 'flow:cancel');
  return keyboard;
}

/**
 * Inline keyboard for confirmation step.
 */
export function getConfirmationInlineKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('✓ تایید و ثبت', 'flow:confirm')
    .text('✗ انصراف', 'flow:cancel');
}
