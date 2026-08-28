import type { Api } from 'grammy';
import type { BotCommand } from 'grammy/types';
import { resolveAdminIds } from '@/core/bot/middleware/admin.middleware';

/**
 * Standard command list displayed to Buyers.
 */
export const BUYER_BOT_COMMANDS: BotCommand[] = [
  { command: 'start', description: 'منوی اصلی و راهنما' },
  { command: 'balance', description: 'مشاهده موجودی کیف پول' },
  { command: 'topup', description: 'افزایش موجودی کیف پول' },
  { command: 'status', description: 'پیگیری وضعیت آخرین درخواست' },
  { command: 'cancel', description: 'لغو درخواست شارژ فعال' },
];

/**
 * Administrative command list displayed to Admins.
 */
export const ADMIN_BOT_COMMANDS: BotCommand[] = [
  { command: 'start', description: 'پنل مدیریت' },
  { command: 'pending', description: 'بررسی درخواست‌های در انتظار' },
  { command: 'rate', description: 'مشاهده نرخ ارز فعلی' },
  { command: 'setrate', description: 'تنظیم نرخ ارز جدید' },
  { command: 'setcard', description: 'تنظیم کارت بانکی مقصد' },
];

/**
 * Configures Telegram commands and resets menu button to default.
 * This prevents the redundant 'منو' text button inside the text input from conflicting
 * with the native keyboard toggle button (4-squares icon on the chat bar).
 */
export async function setupBotCommands(
  api: Api,
  adminIdsSource?: string | Set<bigint>
): Promise<void> {
  try {
    // 1. Reset chat menu button to default so the native keyboard toggle button (4-squares) handles open/close
    await api.setChatMenuButton({
      menu_button: { type: 'default' },
    });

    // 2. Set default commands for regular Buyers
    await api.setMyCommands(BUYER_BOT_COMMANDS, {
      scope: { type: 'default' },
    });

    // 3. Set chat-specific commands for each Admin
    const adminIds = resolveAdminIds(adminIdsSource);
    for (const adminId of adminIds) {
      try {
        await api.setMyCommands(ADMIN_BOT_COMMANDS, {
          scope: { type: 'chat', chat_id: Number(adminId) },
        });
        await api.setChatMenuButton({
          chat_id: Number(adminId),
          menu_button: { type: 'default' },
        });
      } catch (err) {
        console.error(`Failed to set admin commands for ${adminId}:`, err);
      }
    }
  } catch (err) {
    console.error('Failed to setup bot commands and menu button:', err);
  }
}
